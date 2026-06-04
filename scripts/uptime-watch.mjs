/**
 * uptime-watch.mjs — Vigia de disponibilidade do site público da Pluma.
 *
 * Roda via CRON do SISTEMA (fora do processo do app), a cada 1 min.
 * Pinga a URL pública (passando pelo Caddy/HTTPS, como o cliente vê).
 * Em caso de QUEDA, dispara alerta no WhatsApp dos fundadores via Evolution API.
 *
 * Anti-spam: só notifica na MUDANÇA de estado (UP→DOWN e DOWN→UP),
 * usando um arquivo de estado. Não repete alerta enquanto continuar no ar/fora.
 *
 * Anti-falso-positivo: faz até 3 tentativas com intervalo antes de declarar DOWN.
 *
 * Uso:
 *   node scripts/uptime-watch.mjs          # ciclo normal (cron)
 *   node scripts/uptime-watch.mjs --test   # envia 1 msg de teste e sai
 *
 * LIMITAÇÃO HONESTA: roda na MESMA VPS do app/Evolution. Pega o caso comum
 * (app caiu, mas Docker/Evolution de pé). Se a VPS inteira ou a rede cair,
 * este vigia também cai e não consegue avisar — para isso, monitor externo.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'data', 'uptime-state.json');

// ── Carrega .env manualmente (sem dependências; cron não herda env) ──────────
function loadEnv() {
  const env = {};
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const linha of raw.split('\n')) {
      const l = linha.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i === -1) continue;
      const k = l.slice(0, i).trim();
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[k] = v;
    }
  } catch (e) {
    console.error('[uptime-watch] não consegui ler .env:', e.message);
  }
  return env;
}

const env = loadEnv();
const URL_ALVO = env.UPTIME_URL || 'https://plumapijamas.com.br/health';
const TIMEOUT_MS = 10000;
const TENTATIVAS = 3;
const INTERVALO_RETRY_MS = 5000;

function fmtNumero(numero) {
  const n = String(numero || '').replace(/\D/g, '');
  if (!n) return null;
  return n.startsWith('55') ? n : '55' + n;
}

const ADMINS = [env.NUMERO_FELIPE, env.NUMERO_JULLY].map(fmtNumero).filter(Boolean);

async function checar() {
  for (let i = 1; i <= TENTATIVAS; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const resp = await fetch(URL_ALVO, { signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (resp.ok) return { up: true, code: resp.status };
      // status != 2xx → tenta de novo antes de declarar queda
      if (i < TENTATIVAS) await new Promise(r => setTimeout(r, INTERVALO_RETRY_MS));
      else return { up: false, code: resp.status };
    } catch (e) {
      if (i < TENTATIVAS) await new Promise(r => setTimeout(r, INTERVALO_RETRY_MS));
      else return { up: false, code: 0, erro: e.name === 'AbortError' ? 'timeout' : e.message };
    }
  }
  return { up: false, code: 0 };
}

async function enviarWhats(texto) {
  const apiUrl = env.EVOLUTION_API_URL;
  const apiKey = env.EVOLUTION_API_KEY;
  const instance = env.EVOLUTION_INSTANCE;
  if (!apiUrl || !apiKey || !instance) {
    console.error('[uptime-watch] Evolution não configurado — não enviei alerta');
    return;
  }
  for (const number of ADMINS) {
    try {
      const resp = await fetch(`${apiUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, text: texto, delay: 0 })
      });
      console.log(`[uptime-watch] alerta -> ${number}: HTTP ${resp.status}`);
    } catch (e) {
      console.error(`[uptime-watch] falha ao alertar ${number}:`, e.message);
    }
  }
}

function lerEstado() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { status: 'UNKNOWN', desde: null }; }
}
function salvarEstado(s) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  } catch (e) { console.error('[uptime-watch] falha ao salvar estado:', e.message); }
}

function agora() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Boa_Vista' });
}

async function main() {
  if (process.argv.includes('--test')) {
    await enviarWhats(`🔔 *Pluma — Vigia de Site ARMADO*\n\nMonitoramento de disponibilidade ativo. Você será avisado aqui se o site sair do ar.\n\n_${agora()}_`);
    console.log('[uptime-watch] mensagem de teste enviada para:', ADMINS.join(', '));
    return;
  }

  const r = await checar();
  const anterior = lerEstado();
  const novo = r.up ? 'UP' : 'DOWN';

  console.log(`[uptime-watch] ${agora()} | ${URL_ALVO} | ${novo} (HTTP ${r.code}${r.erro ? ', ' + r.erro : ''}) | anterior=${anterior.status}`);

  if (novo === anterior.status) return; // sem mudança → silêncio

  if (novo === 'DOWN') {
    await enviarWhats(`🔴 *ALERTA — Site da Pluma FORA DO AR*\n\n🌐 ${URL_ALVO}\n⚠️ Resposta: ${r.code === 0 ? (r.erro || 'sem conexão') : 'HTTP ' + r.code}\n🕐 ${agora()}\n\nVerifique o servidor assim que possível.`);
  } else if (anterior.status === 'DOWN') {
    const desde = anterior.desde ? new Date(anterior.desde) : null;
    const minOff = desde ? Math.round((Date.now() - desde.getTime()) / 60000) : null;
    await enviarWhats(`🟢 *Site da Pluma VOLTOU ao ar*\n\n🌐 ${URL_ALVO}\n✅ HTTP ${r.code}\n🕐 ${agora()}${minOff != null ? `\n⏱️ Ficou ~${minOff} min fora` : ''}`);
  }

  salvarEstado({ status: novo, desde: new Date().toISOString(), code: r.code });
}

main().catch(e => { console.error('[uptime-watch] erro fatal:', e); process.exit(1); });
