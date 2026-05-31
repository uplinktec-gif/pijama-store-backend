/**
 * src/controllers/financeiro.controller.js
 * Módulo financeiro do painel admin: lançamentos, categorização, importação e dashboard.
 */
import { query, queryOne, run } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { importarTransacoes } from '../services/financeiro/importadorPluggy.js';

/** GET /admin/api/financeiro/categorias */
export async function getCategorias(req, res) {
  try {
    const cats = query('SELECT id, nome, tipo, cor FROM categorias_financeiras WHERE ativo = 1 ORDER BY tipo, nome');
    res.json({ success: true, categorias: cats });
  } catch (err) {
    logger.error('Erro em getCategorias:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** GET /admin/api/financeiro/transacoes?status=&tipo=&inicio=&fim=&busca= */
export async function listTransacoes(req, res) {
  try {
    const { status, tipo, inicio, fim, busca, limite = 200, offset = 0 } = req.query;
    let sql = `
      SELECT t.*, c.nome AS categoria_nome, c.cor AS categoria_cor
      FROM transacoes_financeiras t
      LEFT JOIN categorias_financeiras c ON c.id = t.categoria_id
      WHERE 1=1`;
    const p = [];
    if (status) { sql += ' AND t.status_categorizacao = ?'; p.push(status); }
    if (tipo)   { sql += ' AND t.tipo_movimento = ?'; p.push(tipo); }
    if (inicio) { sql += ' AND DATE(t.data_transacao) >= DATE(?)'; p.push(inicio); }
    if (fim)    { sql += ' AND DATE(t.data_transacao) <= DATE(?)'; p.push(fim); }
    if (busca)  { sql += ' AND (t.contraparte LIKE ? OR t.descricao LIKE ?)'; p.push(`%${busca}%`, `%${busca}%`); }
    sql += ' ORDER BY t.data_transacao DESC LIMIT ? OFFSET ?';
    p.push(parseInt(limite), parseInt(offset));

    const transacoes = query(sql, p);
    const pend = queryOne("SELECT COUNT(*) AS n FROM transacoes_financeiras WHERE status_categorizacao = 'PENDENTE'");
    res.json({ success: true, transacoes, total: transacoes.length, pendentes: pend?.n || 0 });
  } catch (err) {
    logger.error('Erro em listTransacoes:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** PATCH /admin/api/financeiro/transacoes/:id/categoria  body: { categoria_id } */
export async function setCategoria(req, res) {
  try {
    const { id } = req.params;
    const { categoria_id } = req.body;
    if (!categoria_id) return res.status(400).json({ error: 'categoria_id é obrigatório' });

    const cat = queryOne('SELECT id, tipo FROM categorias_financeiras WHERE id = ?', [categoria_id]);
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });

    const tx = queryOne('SELECT tipo_movimento FROM transacoes_financeiras WHERE id = ?', [id]);
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });

    // Coerência: crédito → categoria de RECEITA; débito → DESPESA
    const esperado = tx.tipo_movimento === 'CREDITO' ? 'RECEITA' : 'DESPESA';
    if (cat.tipo !== esperado) {
      return res.status(400).json({ error: `Categoria incompatível: ${tx.tipo_movimento} exige categoria de ${esperado}` });
    }

    run(
      `UPDATE transacoes_financeiras
         SET categoria_id = ?, status_categorizacao = 'CATEGORIZADO', updated_at = datetime('now')
       WHERE id = ?`,
      [categoria_id, id]
    );
    res.json({ success: true, id: parseInt(id), categoria_id });
  } catch (err) {
    logger.error('Erro em setCategoria:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** POST /admin/api/financeiro/importar — dispara a leitura do extrato (read-only) */
export async function importar(req, res) {
  try {
    const resultado = await importarTransacoes();
    if (!resultado.success) return res.status(502).json({ error: resultado.error || 'Falha na importação' });
    res.json({ success: true, ...resultado });
  } catch (err) {
    logger.error('Erro em importar:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** GET /admin/api/financeiro/dashboard?mes=YYYY-MM */
export async function dashboard(req, res) {
  try {
    // Mês corrente em Boa Vista (UTC-4) por padrão
    const hojeBV = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 7);
    const mes = (req.query.mes || hojeBV); // 'YYYY-MM'
    const ini = `${mes}-01`;

    const receita = queryOne(
      `SELECT COALESCE(SUM(valor),0) AS v FROM transacoes_financeiras
         WHERE tipo_movimento='CREDITO' AND strftime('%Y-%m', data_transacao) = ?`, [mes]);
    const despesa = queryOne(
      `SELECT COALESCE(SUM(valor),0) AS v FROM transacoes_financeiras
         WHERE tipo_movimento='DEBITO' AND strftime('%Y-%m', data_transacao) = ?`, [mes]);
    const porCategoria = query(
      `SELECT c.nome, c.tipo, c.cor, COALESCE(SUM(t.valor),0) AS total, COUNT(*) AS n
         FROM transacoes_financeiras t
         JOIN categorias_financeiras c ON c.id = t.categoria_id
        WHERE strftime('%Y-%m', t.data_transacao) = ?
        GROUP BY c.id ORDER BY total DESC`, [mes]);
    const pendentes = queryOne(
      `SELECT COUNT(*) AS n FROM transacoes_financeiras
        WHERE status_categorizacao='PENDENTE' AND strftime('%Y-%m', data_transacao) = ?`, [mes]);

    const r = Number(receita?.v) || 0;
    const d = Number(despesa?.v) || 0;
    res.json({
      success: true,
      mes,
      receita: r,
      despesa: d,
      saldo: r - d,
      por_categoria: porCategoria,
      pendentes: pendentes?.n || 0
    });
  } catch (err) {
    logger.error('Erro em dashboard financeiro:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export default { getCategorias, listTransacoes, setCategoria, importar, dashboard };
