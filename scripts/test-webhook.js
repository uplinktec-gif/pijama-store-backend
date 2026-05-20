#!/usr/bin/env node

import 'dotenv/config';
import axios from 'axios';

const BASE_URL = process.env.WEBHOOK_TEST_URL || 'http://localhost:3000';
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'seu_verify_token_arbitrario';

console.log('\n🧪 TESTE DE WEBHOOK WHATSAPP\n');
console.log(`📍 URL: ${BASE_URL}`);
console.log(`🔐 Verify Token: ${VERIFY_TOKEN}\n`);

// ============================================
// TESTE 1: Verificação do Webhook (GET)
// ============================================
async function testeVerificacao() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TESTE 1: Verificação do Webhook (Challenge)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const response = await axios.get(`${BASE_URL}/api/webhook/whatsapp`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'CHALLENGE_ACCEPTED_12345'
      }
    });

    console.log('✅ SUCESSO: Webhook verificado\n');
    console.log('Resposta:', response.data);
    console.log('\n📝 Isso significa que o challenge foi aceito corretamente!\n');
    return true;
  } catch (error) {
    console.log('❌ ERRO: Falha na verificação');
    console.log('Erro:', error.response?.data || error.message);
    console.log('\n⚠️  O token de verificação pode estar errado.\n');
    return false;
  }
}

// ============================================
// TESTE 2: Receber Mensagem (POST)
// ============================================
async function testeReceberMensagem() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TESTE 2: Receber Mensagem de Teste');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Simular payload do WhatsApp
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '1234567890',
                phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID
              },
              messages: [
                {
                  from: process.env.AUTHORIZED_WHATSAPP_NUMBERS?.split(',')[0] || '5595988123456',
                  id: 'wamid.test_' + Date.now(),
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: {
                    body: '2 zara g bordô pra joão'
                  }
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  };

  try {
    const response = await axios.post(`${BASE_URL}/api/webhook/whatsapp`, payload);

    console.log('✅ SUCESSO: Mensagem recebida\n');
    console.log('Resposta:', response.data);
    console.log('\n📝 O servidor respondeu com EVENT_RECEIVED\n');
    console.log('⏳ Agora o sistema está processando a mensagem em background...\n');
    return true;
  } catch (error) {
    console.log('❌ ERRO: Falha ao enviar mensagem');
    console.log('Erro:', error.response?.data || error.message);
    return false;
  }
}

// ============================================
// TESTE 3: Health Check
// ============================================
async function testeHealth() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TESTE 3: Verificação de Saúde');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const response = await axios.get(`${BASE_URL}/health`);

    console.log('✅ SUCESSO: Servidor está saudável\n');
    console.log('Status:', response.data.status);
    console.log('Ambiente:', response.data.environment);
    console.log('\n📝 O servidor está respondendo normalmente\n');
    return true;
  } catch (error) {
    console.log('❌ ERRO: Servidor não respondeu');
    console.log('Erro:', error.message);
    console.log('\n⚠️  Verifique se o servidor está rodando na porta 3000\n');
    return false;
  }
}

// ============================================
// EXECUTAR TESTES
// ============================================
async function executarTestes() {
  const resultados = [];

  console.log('Aguarde, executando testes...\n');

  await new Promise(resolve => setTimeout(resolve, 500));

  resultados.push(await testeHealth());
  await new Promise(resolve => setTimeout(resolve, 1000));

  resultados.push(await testeVerificacao());
  await new Promise(resolve => setTimeout(resolve, 1000));

  resultados.push(await testeReceberMensagem());
  await new Promise(resolve => setTimeout(resolve, 2000));

  // ============================================
  // RESUMO
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('RESUMO DOS TESTES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const sucessos = resultados.filter(r => r).length;
  const total = resultados.length;

  console.log(`✅ Sucessos: ${sucessos}/${total}`);
  console.log(`${sucessos === total ? '🎉 TODOS OS TESTES PASSARAM!' : '❌ Alguns testes falharam'}\n`);

  if (sucessos === total) {
    console.log('📝 PRÓXIMOS PASSOS:\n');
    console.log('1. Configure o webhook no painel WhatsApp Business');
    console.log('2. Use a URL pública do ngrok: {tunnel_url}/api/webhook/whatsapp');
    console.log('3. Set Verify Token to:', VERIFY_TOKEN);
    console.log('4. Click: Verify and Save\n');
    console.log('5. Envie uma mensagem real do seu WhatsApp\n');
    console.log('6. Verifique se aparecem em: Google Sheets > PEDIDOS_E_VENDAS\n');
  } else {
    console.log('⚠️  Corrija os erros acima e tente novamente\n');
  }

  process.exit(sucessos === total ? 0 : 1);
}

// Executar
executarTestes().catch(error => {
  console.error('❌ Erro fatal:', error.message);
  process.exit(1);
});
