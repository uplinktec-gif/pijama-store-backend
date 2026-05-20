import express from 'express';
import passport from 'passport';
import * as authController from '../controllers/auth.controller.js';

const router = express.Router();

/**
 * ===== AUTENTICAÇÃO POR CPF =====
 */

/**
 * POST /auth/cliente/cpf
 * Login por CPF (primeira etapa)
 * Body: { cpf: "12345678901" }
 */
router.post('/cliente/cpf', authController.loginComCPF);

/**
 * POST /auth/cliente/confirmar-identidade
 * Confirmar identidade (últimos 2 dígitos do CPF)
 * Body: { cpf: "12345678901", ultimos_2_digitos: "01" }
 */
router.post('/cliente/confirmar-identidade', authController.confirmarIdentidade);

/**
 * POST /auth/cliente/registrar
 * Cadastro novo por CPF
 * Body: { cpf: "12345678901", nome: "João", celular: "5595988123456", email: "joao@email.com" }
 */
router.post('/cliente/registrar', authController.registrarComCPF);

/**
 * ===== AUTENTICAÇÃO COM GOOGLE =====
 */

/**
 * GET /auth/google
 * Inicia fluxo de login com Google
 * Redireciona para Google para autenticação
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false // Sem suporte a sessão no servidor (usar tokens)
  })
);

/**
 * GET /auth/google/callback
 * Callback após Google autenticar
 * Google redireciona aqui com código de autorização
 */
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/?auth=google_falhou'
  }),
  authController.googleAuthCallback
);

/**
 * ===== VALIDAÇÃO E LOGOUT =====
 */

/**
 * POST /auth/validar-token
 * Validar se um token é válido
 * Headers: Authorization: Bearer token_aqui
 */
router.post('/validar-token', authController.validarToken);

/**
 * POST /auth/logout
 * Encerrar sessão (frontend remove token de sessionStorage)
 */
router.post('/logout', authController.logout);

export default router;
