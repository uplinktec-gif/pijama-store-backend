import { initializeDatabase, query, run, saveDatabase } from '../src/config/database.js';
import bcrypt from 'bcryptjs';
import { logger } from '../src/utils/logger.js';

/**
 * Script para inicializar usuário admin no banco de dados
 * Uso: node scripts/init-admin-user.js
 */

async function initAdminUser() {
  try {
    // Inicializar o banco de dados
    await initializeDatabase();

    const adminUsers = [
      { username: 'admin', password: 'admin', nome: 'Admin', email: 'admin@pluma.com' },
      { username: 'felipe', password: process.env.ADMIN_SENHA_FELIPE || 'pijama2025', nome: 'Felipe', email: 'felipe@pluma.com' },
      { username: 'jully', password: process.env.ADMIN_SENHA_JULLY || 'jully2025', nome: 'Júlly', email: 'jully@pluma.com' },
      { username: 'pluma', password: process.env.ADMIN_SENHA_PLUMA || 'pluma2025', nome: 'Pluma', email: 'pluma@pluma.com' }
    ];

    console.log('🔧 Inicializando usuários admin...\n');

    for (const user of adminUsers) {
      try {
        // Verificar se usuário já existe
        const existente = query(
          'SELECT username FROM admin_usuarios WHERE username = ?',
          [user.username]
        );

        if (existente && existente.length > 0) {
          console.log(`⚠️  Usuário "${user.username}" já existe`);
          continue;
        }

        // Hash da senha
        const senhaHash = await bcrypt.hash(user.password, 10);

        // Inserir usuário
        run(
          `INSERT INTO admin_usuarios (username, email, senha_hash, ativo, criado_em, atualizado_em)
           VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
          [user.username, user.email, senhaHash]
        );

        console.log(`✅ Usuário criado: ${user.username} (${user.nome})`);
      } catch (error) {
        console.error(`❌ Erro ao criar usuário ${user.username}:`, error.message);
      }
    }

    // Forçar save do banco de dados
    saveDatabase(true);

    console.log('\n✅ Inicialização concluída!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    process.exit(1);
  }
}

initAdminUser();
