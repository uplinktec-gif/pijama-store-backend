/**
 * src/services/financeiro/importadorPluggy.js
 *
 * Importador passivo do extrato bancário (InfinitePay/Pluggy) via MCP.
 * Faz o handshake MCP (Streamable HTTP) usando a URL secreta em
 * process.env.PLUGGY_MCP_URL e insere as transações em transacoes_financeiras.
 *
 * SOMENTE LEITURA do banco. Idempotente via external_id (UNIQUE).
 * A URL/token NUNCA é logada.
 */
import { run, query, queryOne } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const ACCEPT = 'application/json, text/event-stream';

/**
 * Extrai o objeto JSON-RPC de uma resposta (pode vir como SSE "data: {...}").
 */
function parseMcpBody(text) {
  const t = (text || '').trim();
  // SSE: linhas "data: {...}"
  const dataLine = t.split('\n').find(l => l.startsWith('data:'));
  const jsonStr = dataLine ? dataLine.slice(5).trim() : t;
  return JSON.parse(jsonStr);
}

/**
 * Cliente MCP mínimo: initialize → initialized → tools/call (reusa session).
 */
async function criarSessaoMcp(url) {
  // 1) initialize
  const initResp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': ACCEPT },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'pluma-importador', version: '1.0' } }
    })
  });
  if (!initResp.ok) throw new Error(`MCP initialize falhou: HTTP ${initResp.status}`);
  const sessionId = initResp.headers.get('mcp-session-id');
  if (!sessionId) throw new Error('MCP não retornou mcp-session-id');
  await initResp.text(); // drena o corpo

  // 2) notifications/initialized
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': ACCEPT, 'Mcp-Session-Id': sessionId },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
  }).then(r => r.text()).catch(() => {});

  // retorna função de chamada de tool
  let callId = 10;
  return async function callTool(name, args = {}) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': ACCEPT, 'Mcp-Session-Id': sessionId },
      body: JSON.stringify({ jsonrpc: '2.0', id: callId++, method: 'tools/call', params: { name, arguments: args } })
    });
    const obj = parseMcpBody(await resp.text());
    if (obj.error) throw new Error(`MCP ${name}: ${obj.error.message || JSON.stringify(obj.error)}`);
    // tools/call retorna result.content[].text (string JSON)
    const content = obj.result?.content || [];
    const textNode = content.find(c => c.type === 'text');
    if (!textNode) return obj.result;
    try { return JSON.parse(textNode.text); } catch { return textNode.text; }
  };
}

/**
 * Mapeia uma transação do Pluggy para uma linha de transacoes_financeiras.
 */
function mapTransacao(tx) {
  const tipo = (tx.type || '').toUpperCase() === 'DEBIT' ? 'DEBITO' : 'CREDITO';
  const valor = Math.abs(parseFloat(tx.amount) || 0);
  return {
    external_id: tx.id,
    data_transacao: tx.date || tx.dateTime || '',
    valor,
    tipo_movimento: tipo,
    contraparte: (tx.description || tx.paymentData?.payer?.name || tx.paymentData?.receiver?.name || '').slice(0, 200),
    descricao: (tx.description || '').slice(0, 300),
    raw_json: JSON.stringify(tx)
  };
}

/**
 * Importa as transações de todas as contas BANK da conexão.
 * @returns {Promise<{success:boolean, importadas:number, ignoradas:number, total:number, contas:number, error?:string}>}
 */
export async function importarTransacoes() {
  const url = process.env.PLUGGY_MCP_URL;
  if (!url) {
    return { success: false, importadas: 0, ignoradas: 0, total: 0, contas: 0, error: 'PLUGGY_MCP_URL não configurada no .env' };
  }

  let importadas = 0, ignoradas = 0, total = 0, contas = 0;

  try {
    const call = await criarSessaoMcp(url);

    // 1) Contas da conexão (única conexão = InfinitePay)
    const accResp = await call('openfinance_list_accounts', {});
    const accounts = (accResp.results || []).filter(a => (a.type || '').toUpperCase() === 'BANK');
    contas = accounts.length;
    if (contas === 0) {
      return { success: false, importadas: 0, ignoradas: 0, total: 0, contas: 0, error: 'Nenhuma conta BANK encontrada' };
    }

    // statement INSERT idempotente (external_id UNIQUE → OR IGNORE)
    const insert = (t) => run(
      `INSERT OR IGNORE INTO transacoes_financeiras
         (external_id, data_transacao, valor, tipo_movimento, contraparte, descricao,
          categoria_id, status_categorizacao, origem, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'PENDENTE', 'mcp', ?)`,
      [t.external_id, t.data_transacao, t.valor, t.tipo_movimento, t.contraparte, t.descricao, t.raw_json]
    );

    // 2) Transações por conta
    for (const acc of accounts) {
      const txResp = await call('openfinance_list_transactions', { account_id: acc.id });
      const txs = txResp.results || [];
      for (const tx of txs) {
        if (!tx.id) continue;
        total++;
        const m = mapTransacao(tx);
        const r = insert(m);
        // changes === 1 → inseriu; 0 → já existia (idempotência)
        if (r.changes && r.changes > 0) importadas++; else ignoradas++;
      }
    }

    logger.info(`[financeiro] Importação: ${importadas} nova(s), ${ignoradas} já existente(s), ${total} lida(s) de ${contas} conta(s)`);
    return { success: true, importadas, ignoradas, total, contas };
  } catch (error) {
    logger.error('[financeiro] Erro na importação Pluggy:', error.message);
    return { success: false, importadas, ignoradas, total, contas, error: error.message };
  }
}

/**
 * Saldo atual das contas (read-only) — usado no dashboard se desejado.
 */
export async function obterSaldo() {
  const url = process.env.PLUGGY_MCP_URL;
  if (!url) return { success: false, error: 'PLUGGY_MCP_URL não configurada' };
  try {
    const call = await criarSessaoMcp(url);
    const accResp = await call('openfinance_list_accounts', {});
    const contas = (accResp.results || []).map(a => ({
      banco: accResp.bank, conta: a.number, saldo: parseFloat(a.balance) || 0
    }));
    return { success: true, contas };
  } catch (error) {
    logger.error('[financeiro] Erro ao obter saldo:', error.message);
    return { success: false, error: error.message };
  }
}
