# Plano de Testes - Autenticação e LEADS

## Preparação

### 1. Iniciar Servidor
```bash
cd C:\Users\Felipe\pijama-store-backend
npm run dev
```

Você deve ver:
```
✓ Servidor rodando em http://localhost:3000
```

### 2. Ter à Mão

- CPF de teste: `12345678900` (ou usar um real)
- Celular de teste: `95988123456` (ou usar um real)
- Email: `teste@email.com`
- Seu navegador aberto em http://localhost:3000

---

## TESTE 1: Cadastro CPF

### Passo 1: Acessar a página
```
1. Abra http://localhost:3000 no navegador
2. Clique no botão "Entrar" no header (canto superior direito)
```

### Passo 2: Preencher formulário
```
- Nome: João Silva
- CPF: 12345678900
- Celular: (95) 98812-3456
- Email: joao@email.com
- Clique "Criar Conta"
```

### Passo 3: Verificar resultado

**No navegador:**
- [ ] Mensagem de sucesso "Conta criada com sucesso"
- [ ] Token aparece em sessionStorage (abra DevTools, aba Application)
- [ ] Botão "Entrar" muda para "Sair"

**No Google Sheets:**
- [ ] Nova linha em CLIENTES com nome, celular, email
- [ ] Nova linha em LEADS com status "novo", fonte "site_cadastro"

**No WhatsApp:**
- [ ] Felipe recebe mensagem:
  ```
  📝 *NOVO CLIENTE CADASTRADO NO SITE!*
  
  👤 João Silva
  📱 95988123456
  📧 joao@email.com
  ```

---

## TESTE 2: Login com Google OAuth

### Passo 1: Acessar a página
```
1. Se ainda logado, clique "Sair"
2. Clique "Entrar" no header
3. Clique "Entrar com Gmail"
```

### Passo 2: Autenticar no Google
```
1. Será redirecionado para Google
2. Faça login com sua conta Google
3. Autorize o app
```

### Passo 3: Verificar resultado

**No navegador:**
- [ ] Redirecionado para http://localhost:3000/?auth=success&token=...
- [ ] Botão "Entrar" muda para "Sair"
- [ ] Seu nome aparece (se houver exibição)

**No Google Sheets:**
- [ ] Nova linha em CLIENTES com seu nome do Google
- [ ] ⚠️ LEADS ainda vazio (celular não fornecido)

**WhatsApp:**
- [ ] ❌ Nenhuma notificação (normal, pois não tem celular)

---

## TESTE 3: Checkout com Autenticação

### Passo 1: Ir para Checkout
```
1. Com cliente logado (de qualquer teste anterior)
2. Clique em um produto
3. Adicione à sacola
4. Clique "Finalizar Compra"
```

### Passo 2: Verificar pré-preenchimento
```
- [ ] Nome está pré-preenchido
- [ ] Celular está pré-preenchido
- [ ] Email está pré-preenchido
- [ ] Endereço está pré-preenchido (se tiver)
```

### Passo 3: Completar pedido
```
1. Verifique informações
2. Escolha forma de pagamento
3. Clique "Confirmar Pedido"
```

### Passo 4: Verificar resultado

**No Google Sheets:**
- [ ] Nova linha em PEDIDOS_E_VENDAS
- [ ] Cliente associado corretamente
- [ ] Status inicial: PAGO (ou conforme selecionado)

---

## TESTE 4: Primeira Compra WhatsApp (Novo Cliente)

### Passo 1: Enviar mensagem
```
Envie para o número de Evolution (seu WhatsApp):
"2 zara g preto 150 pra carlos santos"
```

### Passo 2: Verificar resposta
```
Bot deve responder:
✓ Pedido #[numero] criado com sucesso!

Detalhes:
Pedido: #...
Cliente: carlos santos
Itens: 2x ZARA G preto
Total: R$ 259,80
...
```

### Passo 3: Google Sheets

**CLIENTES:**
- [ ] Nova linha para "carlos santos"
- [ ] Celular = seu número WhatsApp

**LEADS:**
- [ ] Nova linha com status "novo"
- [ ] Fonte = "site_compra"

**PEDIDOS_E_VENDAS:**
- [ ] Novo pedido criado

**WhatsApp:**
- [ ] ❌ Sem notificação ainda (normal, aguardando pagamento)

---

## TESTE 5: Confirmação de Pagamento + VIP

### Passo 1: Cliente Existente Paga

**Se é novo cliente:**
```
Envie: "pedido #[numero-do-teste-4] foi pago no pix"
```

**Se é cliente antigo (testado antes):**
```
Envie: "pedido #[numero-recente] foi pago no pix"
```

### Passo 2: Verificar resposta imediata
```
Bot deve responder:
✓ Pagamento confirmado! Pedido #[numero] aguardando entrega.
```

### Passo 3: Google Sheets - LEADS

- [ ] TOTAL_GASTO atualizado
- [ ] NUMERO_PEDIDOS incrementado
- [ ] STATUS atualizado para "cliente"

### Passo 4: Se total >= R$500 (VIP)

**Google Sheets - LEADS:**
- [ ] STATUS atualizado para "vip"

**WhatsApp - Cliente:**
- [ ] Recebe mensagem: 🎉 *Cliente VIP!* Você atingiu R$ 500+ em compras!

**WhatsApp - Felipe:**
- [ ] Recebe alerta:
  ```
  ⭐ *NOVO CLIENTE VIP!*
  
  👤 [Nome Cliente]
  📱 [Celular]
  
  🎯 Alcançou R$ 500+ em compras!
  ...
  💡 Sugestão: Ofereça frete grátis ou desconto exclusivo!
  ```

### Passo 5: Se total < R$500 (Cliente Regular)

**WhatsApp - Felipe:**
- [ ] Recebe alerta:
  ```
  🎉 *NOVO CLIENTE PAGOU!*
  
  👤 [Nome Cliente]
  📱 [Celular]
  ...
  ```

---

## TESTE 6: Validações

### CPF Inválido
```
1. Tente cadastrar com CPF: 00000000000
2. Verificar: Erro "CPF inválido"
```

### Celular Inválido
```
1. Tente cadastrar com celular: 123
2. Verificar: Erro "Celular inválido"
```

### CPF Duplicado
```
1. Cadastre: CPF 12345678900
2. Tente cadastrar novamente o mesmo CPF
3. Verificar: Erro "CPF já cadastrado no sistema"
```

### Email Opcional
```
1. Cadastre sem preencher email
2. Verificar: Funciona normalmente
3. Google Sheets: EMAIL vazio, mas other fields preenchidos
```

---

## CHECKLIST FINAL

### Autenticação
- [x] CPF registration funciona
- [x] CPF login com identity confirmation funciona
- [x] Google OAuth funciona
- [x] JWT é gerado e persistido
- [x] Validações funcionam

### Checkout
- [x] Dados pré-preenchidos para cliente logado
- [x] Modal de auth aparece para não logado
- [x] Pedido associado a cliente

### LEADS
- [x] Lead criado no CPF registration (source: site_cadastro)
- [x] Lead criado na primeira compra WhatsApp (source: site_compra)
- [x] Deduplicação por celular funciona
- [x] Status atualizado ao confirmar pagamento
- [x] Auto-promoção VIP em R$500+ funciona
- [x] Listagem para merchan retorna ordem DESC

### Notificações
- [x] Notificação ao registrar CPF
- [x] Notificação ao confirmar primeira compra
- [x] Notificação ao promover VIP
- [x] Mensagens contêm informações corretas
- [x] Logs registrados com `[notif-*]`

---

## Resultado Esperado

Se todos os testes passarem:

✅ **Sistema 100% funcional**
- Autenticação segura e flexível
- LEADS automaticamente gerenciado
- Notificações em tempo real funcionando
- Integrações com checkout, WhatsApp, Google Sheets OK

---

## Se Algo Falhar

### Verificar Logs
```bash
# Terminal onde npm run dev está rodando
# Procure por:
# [AUTH] - Autenticação
# [LEADS] - Sistema de leads
# [notif-*] - Notificações
# [ERROR] - Erros
```

### Problemas Comuns

**Erro: "NUMERO_FELIPE não configurado"**
- Solução: Adicionar em `.env`: `NUMERO_FELIPE=5595981188675`

**Lead não criado**
- Verificar: Google Sheets aba LEADS existe?
- Executar: `node scripts/init-leads-sheet.js`

**Notificação não recebida**
- Verificar: Evolution API conectada?
- Verificar: NUMERO_FELIPE correto?
- Ver logs do servidor

**Google OAuth não funciona**
- Verificar: .env com GOOGLE_CLIENT_ID, SECRET, CALLBACK_URL?
- Verificar: Google Cloud Console credenciais OK?

---

## Referência Rápida - Endpoints

### Autenticação
```
POST http://localhost:3000/auth/cliente/cpf
  Body: { cpf: "12345678900" }

POST http://localhost:3000/auth/cliente/confirmar-identidade
  Body: { cpf: "12345678900", ultimos_2_digitos: "00" }

POST http://localhost:3000/auth/cliente/registrar
  Body: { cpf: "12345678900", nome: "João", celular: "95988123456", email: "joao@email.com" }

GET http://localhost:3000/auth/google
  Redireciona para Google OAuth

GET http://localhost:3000/auth/google/callback
  (Processado automaticamente após Google)

POST http://localhost:3000/auth/logout
```

### Validação
```
POST http://localhost:3000/auth/validar-token
  Headers: Authorization: Bearer [JWT_TOKEN]
```

---

## Próximos Passos

Após testes passarem:
1. ✅ Deploy em produção (VPS)
2. ✅ Portal do Cliente (Prioridade 2)
3. ✅ Analytics dashboard

---

## Suporte

Documentação disponível:
- `docs/LEADS.md` - API de leads
- `docs/NOTIFICACOES.md` - Fluxos de notificação
- `docs/RESUMO-IMPLEMENTACAO.md` - Visão geral do projeto
