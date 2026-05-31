/**
 * scripts/otimizar-luna-preto.mjs
 *
 * Converte os 3 JPEGs de /tmp/luna-preto/ para WebP otimizado:
 *   • largura 1080px (mantém proporção)
 *   • qualidade ajustada em loop para ficar ≤ 150 KB
 *
 * Saída: public/store/img/luna-preto/{1,2,3}.webp
 */
import sharp from 'sharp';
import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR  = resolve(__dirname, '..');
const OUT_DIR   = resolve(ROOT_DIR, 'public/store/img/luna-preto');
const MAX_KB    = 150;
const TARGET_W  = 1080;
// Windows: /tmp/ vira C:\Users\Felipe\AppData\Local\Temp pelo Git Bash
const TMP_DIR   = process.env.TEMP
  ? resolve(process.env.TEMP, 'luna-preto')
  : '/tmp/luna-preto';

await fs.mkdir(OUT_DIR, { recursive: true });

const INPUTS = [
  { src: `${TMP_DIR}/foto1.bin`, out: 'capa.webp' },     // capa (principal)
  { src: `${TMP_DIR}/foto2.bin`, out: 'galeria.webp' },  // galeria
  { src: `${TMP_DIR}/foto3.bin`, out: 'detalhe.webp' },  // detalhe
];

console.log(`📷 Convertendo ${INPUTS.length} fotos → WebP ≤ ${MAX_KB} KB (largura ${TARGET_W}px)\n`);

for (const { src, out } of INPUTS) {
  const outPath = resolve(OUT_DIR, out);
  let quality = 82;     // chute inicial
  let buf;

  // Loop: reduz quality até atingir ≤ MAX_KB
  for (let i = 0; i < 10; i++) {
    buf = await sharp(src)
      .resize({ width: TARGET_W, withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toBuffer();
    const kb = buf.length / 1024;
    if (kb <= MAX_KB || quality <= 30) break;
    quality -= 6;
  }

  await fs.writeFile(outPath, buf);
  const sizeKB = (buf.length / 1024).toFixed(1);
  console.log(`  ✓ ${out.padEnd(14)}  →  ${sizeKB} KB  (quality ${quality})`);
}

console.log(`\n📂 Arquivos em: ${OUT_DIR}`);
