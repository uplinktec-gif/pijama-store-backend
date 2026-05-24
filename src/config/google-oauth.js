import passport from 'passport';
import GoogleStrategy from 'passport-google-oauth20';
import { logger } from '../utils/logger.js';
import * as clientesService from '../services/sqlite/clientes.js';

/**
 * Configura Passport com estratégia Google OAuth 2.0
 */
export function configurarGoogleOAuth() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL;

  if (!clientID || !clientSecret || !callbackURL) {
    logger.warn('⚠️ Variáveis Google OAuth não configuradas no .env');
    logger.warn('   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL são obrigatórias');
    return;
  }

  /**
   * Estratégia Google OAuth 2.0
   */
  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          logger.info(`[Google OAuth] Usuário: ${profile.displayName} (${profile.id})`);

          // Extrair informações do Google
          const googleId = profile.id;
          const nome = profile.displayName;
          const email = profile.emails?.[0]?.value;
          const foto = profile.photos?.[0]?.value;

          // Buscar cliente por Google ID
          let cliente = await clientesService.findByGoogleId(googleId);

          // Se não encontrou, buscar por email
          if (!cliente && email) {
            cliente = await clientesService.findByWhatsApp(email);
          }

          // Se não encontrou por email, criar novo
          if (!cliente) {
            logger.info(`[Google OAuth] Novo cliente: ${nome} (${email})`);

            const resultado = await clientesService.criarCliente({
              nome,
              email,
              google_id: googleId,
              observacoes: `Registrado via Google OAuth | Foto: ${foto || 'N/A'}`
            });

            if (resultado.success) {
              cliente = await clientesService.findById(resultado.idCliente);
            } else {
              logger.error('[Google OAuth] Erro ao criar cliente:', resultado.error);
              return done(null, false, { message: 'Erro ao criar conta' });
            }
          } else {
            logger.info(`[Google OAuth] Cliente existente: ${cliente.nome}`);

            // Atualizar Google ID se ainda não tiver
            if (!cliente.google_id) {
              await clientesService.atualizarCliente(cliente.id_cliente, {
                google_id: googleId
              });
            }
          }

          // Retornar cliente para sessão
          return done(null, {
            id_cliente: cliente.id_cliente,
            nome: cliente.nome,
            email: cliente.email,
            whatsapp: cliente.whatsapp,
            google_id: googleId,
            tipo: 'cliente'
          });
        } catch (error) {
          logger.error('[Google OAuth] Erro na estratégia:', error.message);
          return done(error);
        }
      }
    )
  );

  /**
   * Serializar usuário para sessão
   */
  passport.serializeUser((user, done) => {
    logger.debug(`[Passport] Serializando: ${user.id_cliente}`);
    done(null, user);
  });

  /**
   * Desserializar usuário de sessão
   */
  passport.deserializeUser((user, done) => {
    logger.debug(`[Passport] Desserializando: ${user.id_cliente}`);
    done(null, user);
  });

  logger.info('✓ Google OAuth configurado');
}

export default passport;
