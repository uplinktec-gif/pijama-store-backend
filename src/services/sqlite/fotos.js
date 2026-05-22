import { query, run, transaction } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Lê todas as fotos e retorna no formato esperado pelo sistema
 * Formato: { fotos: { MODELO: { cor: [ids] } }, capas: { MODELO: cor } }
 */
export async function lerFotos() {
  try {
    const rows = query('SELECT * FROM fotos ORDER BY modelo, cor');

    const fotos = {};
    const capas = {};

    for (const row of rows) {
      const modelo = (row.modelo || '').toUpperCase();
      const cor = (row.cor || '').toLowerCase();

      let ids = [];
      try {
        const parsed = JSON.parse(row.photo_ids_json || '[]');
        if (Array.isArray(parsed)) {
          // Bug de migração: pode ser ["id1,id2,id3"] (string única com vírgulas)
          if (parsed.length === 1 && typeof parsed[0] === 'string' && parsed[0].includes(',')) {
            ids = parsed[0].split(',').map(id => id.trim()).filter(Boolean);
          } else {
            ids = parsed.filter(Boolean);
          }
        } else if (typeof parsed === 'string') {
          ids = parsed.split(',').map(id => id.trim()).filter(Boolean);
        }
      } catch (_) {
        ids = [];
      }

      if (!fotos[modelo]) fotos[modelo] = {};
      fotos[modelo][cor] = ids;

      if (row.eh_capa === 1 || row.eh_capa === '1') {
        capas[modelo] = cor;
      }
    }

    return { fotos, capas };
  } catch (error) {
    logger.error('[sqlite:fotos] lerFotos:', error.message);
    return { fotos: {}, capas: {} };
  }
}

/**
 * Define a foto de capa para um modelo
 */
export async function atualizarCapa(modelo, cor) {
  try {
    const modeloNorm = (modelo || '').toUpperCase();
    const corNorm = (cor || '').toLowerCase();
    const now = new Date().toISOString();

    transaction(() => {
      // Remover capa atual do modelo
      run(
        'UPDATE fotos SET eh_capa = 0, updated_at = ? WHERE UPPER(modelo) = ?',
        [now, modeloNorm]
      );
      // Definir nova capa
      run(
        'UPDATE fotos SET eh_capa = 1, updated_at = ? WHERE UPPER(modelo) = ? AND LOWER(cor) = ?',
        [now, modeloNorm, corNorm]
      );
    });

    return true;
  } catch (error) {
    logger.error('[sqlite:fotos] atualizarCapa:', error.message);
    return false;
  }
}

/**
 * No-op para compatibilidade com sheets/fotos.js
 */
export async function inicializarAbaFotos(dadosIniciais) {
  return true;
}
