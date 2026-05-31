import express from 'express';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { configurarGoogleOAuth } from './config/google-oauth.js';
import { registrarRotasMonitor } from './services/monitor/evolution-monitor.js';
import * as webhookController from './controllers/webhook.controller.js';
import apiRoutes from './routes/api.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import adminRoutes from './routes/admin.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';
import storeRoutes from './routes/store.routes.js';
import clienteRoutes from './routes/cliente.routes.js';
import authRoutes from './routes/auth.routes.js';
import webhookReceiverRoutes from './routes/webhook-receiver.routes.js';
import sseRoutes from './routes/sse.routes.js';
import aiDashboardRoutes from './routes/ai-dashboard.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Atrás do Caddy (reverse proxy) — confia no primeiro hop para ler o IP real
// (X-Forwarded-For). Necessário para o rate-limit funcionar por IP de verdade.
app.set('trust proxy', 1);

// ─── Helmet: headers de segurança ────────────────────────────────────────────
// CSP/COEP/CORP desligados de propósito: a loja usa scripts inline + CDNs
// (marked.js, jsPDF) e imagens externas (googleusercontent). Mantém os demais
// headers úteis (nosniff, X-Frame-Options, HSTS, oculta X-Powered-By).
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

// ─── Rate limiters ───────────────────────────────────────────────────────────
// Limitador GLOBAL leve para a API pública (anti-DDoS básico). Não conta:
//  - webhook do WhatsApp (Evolution faz bursts legítimos, já protegido por secret)
//  - SSE (conexões longas)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minuto
  max: 300,                   // 300 req/min por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em instantes.' },
  skip: (req) =>
    req.path.startsWith('/api/webhook/whatsapp') ||
    req.path.startsWith('/api/sse')
});

// Limitador SEVERO exclusivo do login admin (anti-brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutos
  max: 5,                     // 5 tentativas por IP
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // só conta tentativas que falharam
  message: { sucesso: false, mensagem: 'Muitas tentativas de login. Aguarde 15 minutos.' }
});

// ─── Validação do webhook WhatsApp ───────────────────────────────────────────
// A Evolution envia um header secreto. Sem o header correto → 403.
// Fail-open SE o secret não estiver configurado (evita derrubar o bot por
// esquecimento) — mas registra aviso para não passar despercebido.
function validarSegredoWebhook(req, res, next) {
  const segredo = env.evolutionWebhookSecret;
  if (!segredo) {
    logger.warn('[webhook] ⚠️ EVOLUTION_WEBHOOK_SECRET não configurado — validação desativada (fail-open)');
    return next();
  }
  const recebido = req.headers['x-webhook-secret'] || req.headers['apikey'] || '';
  if (recebido !== segredo) {
    logger.warn(`[webhook] ❌ Segredo inválido/ausente — requisição rejeitada (IP: ${req.ip})`);
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}

// Configurar Google OAuth
configurarGoogleOAuth();

// Registrar rotas de monitoramento
registrarRotasMonitor(app);

// CORS middleware - permitir apenas domínios confiáveis em produção
app.use((req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:7003',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    'https://plumapijamas.com.br',
    'https://www.plumapijamas.com.br'
  ];

  const origin = req.get('origin');
  if (isDev || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', isDev ? '*' : origin || allowedOrigins[0]);
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Admin-Token');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware
app.use(express.json({
  limit: '10mb'
}));

// Session middleware (para Google OAuth)
const sessionSecret = process.env.CLIENTE_SESSION_SECRET;
if (process.env.NODE_ENV === 'production' && !sessionSecret) {
  throw new Error('❌ ERRO: CLIENTE_SESSION_SECRET é obrigatório em produção!');
}

app.use(session({
  secret: sessionSecret || 'dev-session-secret-not-for-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS em produção
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoint (apenas em desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/test', (req, res) => {
    res.json({
      message: 'Sistema de Gestão de Vendas - Pijama Store',
      version: '1.0.0',
      status: 'inicializado',
      catalog: {
        modelos: process.env.CATALOG_MODELS?.split(',') || [],
        tamanhos: process.env.CATALOG_SIZES?.split(',') || [],
        cores: process.env.CATALOG_COLORS?.split(',') || []
      }
    });
  });
}

// WhatsApp webhook — POST validado por segredo (Evolution envia no header)
app.post('/api/webhook/whatsapp', validarSegredoWebhook, webhookController.receberMensagem);
app.get('/api/webhook/whatsapp', webhookController.verificarWebhook);

// Autenticação (CPF, OTP WhatsApp e Google OAuth)
app.use('/auth', authRoutes);        // ex: POST /auth/cliente/login
app.use('/api/auth', authRoutes);    // ex: POST /api/auth/iniciar (OTP frictionless)

// Webhook Receiver (sincronização de estoque em tempo real)
app.use('/webhooks', webhookReceiverRoutes);

// API routes — com limitador global anti-DDoS (webhook e SSE isentos via skip)
app.use('/api', globalLimiter, apiRoutes);

// Server-Sent Events (SSE) para atualizações em tempo real
app.use('/api/sse', sseRoutes);

// Portal do Cliente
app.use('/api/cliente', clienteRoutes);

// Dashboard simples
app.use('/dashboard', dashboardRoutes);

// Painel Admin completo — login com limitador severo anti-brute-force
app.use('/admin/api/auth/login', loginLimiter);
app.use('/admin/api', adminRoutes);
app.use('/admin/api/webhooks', webhooksRoutes);
app.use('/api/ai-dashboard', aiDashboardRoutes);
app.use('/admin', express.static(`${dirname(__dirname)}/public/admin`));
app.get('/admin', (req, res) => res.sendFile(`${dirname(__dirname)}/public/admin/index.html`));

// Loja online (plumapijamas.com.br)
app.use('/api/store', storeRoutes);
app.use('/', express.static(`${dirname(__dirname)}/public/store`));
app.get('/', (req, res) => {
  if (req.hostname && req.hostname.startsWith('admin.')) {
    return res.redirect('/admin');
  }
  res.sendFile(`${dirname(__dirname)}/public/store/index.html`);
});

// Portal do Cliente (página única - SPA)
app.use('/portal', express.static(`${dirname(__dirname)}/public/portal`));
app.get('/portal', (req, res) => {
  res.sendFile(`${dirname(__dirname)}/public/portal/index.html`);
});

// Favicon para todo o site (raiz)
app.get('/favicon.svg', (req, res) => {
  res.sendFile(`${dirname(__dirname)}/public/favicon.svg`);
});
app.get('/favicon.ico', (req, res) => {
  res.sendFile(`${dirname(__dirname)}/public/favicon.svg`);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Erro:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;
