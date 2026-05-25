import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function startTunnel() {
  console.log('[TUNNEL] Iniciando LocalTunnel na porta 7003...');

  const ltPath = path.join(__dirname, 'node_modules', '.bin', 'lt');
  const lt = spawn(ltPath, ['--port', '7003'], {
    stdio: 'pipe',
    shell: true
  });

  let output = '';

  lt.stdout.on('data', (data) => {
    const text = data.toString();
    output += text;
    console.log('[TUNNEL STDOUT]', text.trim());

    // Procurar pela URL
    if (text.includes('https://')) {
      const match = text.match(/(https:\/\/[\w\-]+\.loca\.lt)/);
      if (match) {
        const url = match[1];
        console.log(`\n✓ URL PÚBLICA GERADA: ${url}`);
        console.log(`\n📝 Cole isso na Evolution API:\n${url}/api/webhook/whatsapp\n`);
        fs.writeFileSync(path.join(__dirname, 'TUNNEL_URL.txt'), url, 'utf8');
      }
    }
  });

  lt.stderr.on('data', (data) => {
    console.log('[TUNNEL STDERR]', data.toString().trim());
  });

  lt.on('close', (code) => {
    console.log(`\n[TUNNEL] Processo encerrou com código ${code}`);
    console.log('[TUNNEL] Reiniciando em 5 segundos...\n');
    setTimeout(() => startTunnel(), 5000);
  });

  lt.on('error', (err) => {
    console.error('[TUNNEL ERROR]', err);
    console.log('[TUNNEL] Reiniciando em 5 segundos...\n');
    setTimeout(() => startTunnel(), 5000);
  });
}

console.log('='.repeat(60));
console.log('KEEP TUNNEL ALIVE - LocalTunnel Wrapper');
console.log('='.repeat(60));
startTunnel();

// Manter o processo vivo
setInterval(() => {}, 1000);
