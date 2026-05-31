import express from 'express';
import passport from 'passport';
import * as authController from '../controllers/auth.controller.js';
import { validarToken } from '../middleware/authMiddleware.js';

// ─── OTP (Login Frictionless) ─────────────────────────────────────────────────

const router = express.Router();

/**
 * INICIAR OTP — POST /api/auth/iniciar
 * Recebe CPF → retorna novo_cliente ou envia OTP via WhatsApp
 */
router.post('/iniciar', authController.iniciarOTP);

/**
 * VALIDAR OTP — POST /api/auth/validar
 * Recebe { cpf, codigo } → retorna JWT se código correto
 */
router.post('/validar', authController.validarOTP);

/**
 * CADASTRAR CLIENTE — POST /api/auth/cadastrar
 * Recebe { cpf, nome, whatsapp } → cria cliente e retorna JWT
 */
router.post('/cadastrar', authController.cadastrarClienteOTP);

// ─────────────────────────────────────────────────────────────────────────────

/**
 * LOGIN COM CELULAR + CPF (novo sistema)
 * POST /auth/cliente/login
 */
router.post('/cliente/login', authController.loginCelularCpf);

/**
 * LOGIN COM CPF (legado)
 * POST /auth/cliente/cpf
 */
router.post('/cliente/cpf', authController.loginComCPF);

/**
 * CONFIRMAR IDENTIDADE (últimos 2 dígitos do CPF)
 * POST /auth/cliente/confirmar-identidade
 */
router.post('/cliente/confirmar-identidade', authController.confirmarIdentidade);

/**
 * REGISTRAR NOVO CLIENTE
 * POST /auth/cliente/registrar
 */
router.post('/cliente/registrar', authController.registrarCliente);

/**
 * VALIDAR TOKEN
 * POST /auth/validar-token
 */
router.post('/validar-token', validarToken, authController.validarToken);

/**
 * LOGOUT
 * POST /auth/logout
 */
router.post('/logout', authController.logout);

/**
 * GOOGLE OAUTH - Inicia login
 * GET /auth/google
 */
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

/**
 * GOOGLE OAUTH - Callback
 * GET /auth/google/callback
 */
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  authController.googleCallback
);

export default router;
