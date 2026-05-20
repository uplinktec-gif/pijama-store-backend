import express from 'express';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import session from 'express-session';
import passport from 'passport';
import { logger } from './utils/logger.js';
import { configurarGoogleOAuth } from './config/google-oauth.js';
import * as webhookController from './controllers/webhook.controller.js';
import apiRoutes from './routes/api.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import adminRoutes from './routes/admin.routes.js';
import storeRoutes from './routes/store.routes.js';
import clienteRoutes from './routes/cliente.routes.js';
import authRoutes from './routes/auth.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Configurar Google OAuth
configurarGoogleOAuth();

// Middleware
app.use(express.json({
  limit: '10mb'
}));

// Session middleware (para Google OAuth)
app.use(session({
  secret: process.env.CLIENTE_SESSION_SECRET || 'pluma-session-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS em produção
    httpOnly: true,
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

// Test endpoint (será removido em produção)
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

// WhatsApp webhook
app.post('/api/webhook/whatsapp', webhookController.receberMensagem);
app.get('/api/webhook/whatsapp', webhookController.verificarWebhook);

// Autenticação (CPF e Google OAuth)
app.use('/auth', authRoutes);

// API routes
app.use('/api', apiRoutes);

// Portal do Cliente
app.use('/api/cliente', clienteRoutes);

// Dashboard simples
app.use('/dashboard', dashboardRoutes);

// Painel Admin completo
app.use('/admin/api', adminRoutes);
app.use('/admin', express.static(`${__dirname}/public/admin`));
app.get('/admin', (req, res) => res.sendFile(`${__dirname}/public/admin/index.html`));

// Loja online (plumapijamas.com.br)
app.use('/api/store', storeRoutes);
app.use('/', express.static(`${__dirname}/public/store`));
app.get('/', (req, res) => {
  if (req.hostname && req.hostname.startsWith('admin.')) {
    return res.redirect('/admin');
  }
  res.sendFile(`${__dirname}/public/store/index.html`);
});

// Portal do Cliente (página única - SPA)
app.use('/portal', express.static(`${__dirname}/public/portal`));
app.get('/portal', (req, res) => {
  res.sendFile(`${__dirname}/public/portal/index.html`);
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
