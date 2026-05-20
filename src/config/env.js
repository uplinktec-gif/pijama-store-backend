import dotenv from 'dotenv';
dotenv.config({ override: true });

const requiredVars = [
  'GOOGLE_SHEETS_CREDENTIALS_PATH',
  'GOOGLE_SHEETS_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'ANTHROPIC_API_KEY',
  'EVOLUTION_API_KEY',
  'EVOLUTION_INSTANCE'
];

// Validar variáveis obrigatórias
const missingVars = requiredVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.warn(`⚠️ Variáveis de ambiente faltando: ${missingVars.join(', ')}`);
}

const env = {
  // App
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',

  // Google Sheets
  googleSheetsCredentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS_PATH,
  googleSheetsId: process.env.GOOGLE_SHEETS_ID,

  // Evolution API (WhatsApp)
  evolutionApiUrl: process.env.EVOLUTION_API_URL || 'http://177.7.47.211:32775',
  evolutionApiKey: process.env.EVOLUTION_API_KEY,
  evolutionInstance: process.env.EVOLUTION_INSTANCE || 'pijama-store',

  // WhatsApp Webhook
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN,

  // Claude API
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,

  // Catálogo
  catalogoModelos: (process.env.CATALOG_MODELS || '').split(',').filter(Boolean),
  catalogoTamanhos: (process.env.CATALOG_SIZES || '').split(',').filter(Boolean),
  catalogoCores: (process.env.CATALOG_COLORS || '').split(',').filter(Boolean),

  // Preços
  modeloPrecos: (() => {
    try {
      return JSON.parse(process.env.MODEL_PRICES || '{}');
    } catch {
      console.error('❌ Erro ao parsear MODEL_PRICES');
      return {};
    }
  })(),

  // Números WhatsApp autorizados
  authorizedNumbers: (process.env.AUTHORIZED_WHATSAPP_NUMBERS || '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean)
};

export { env };
