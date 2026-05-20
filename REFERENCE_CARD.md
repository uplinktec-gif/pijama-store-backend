# Reference Card — Pijama Store Backend

## 🚀 Quick Commands

```bash
# Start development server
npm run dev

# Run tests (when added)
npm test

# Seed initial inventory (140 SKUs)
npm run seed

# Check logs
tail -f logs/combined.log
tail -f logs/error.log
```

## 📡 Endpoints

### Health & Status
- `GET /health` - Server status
- `GET /api/test` - Catalog test

### Inventory
- `GET /api/estoque` - All inventory
- `GET /api/estoque/baixo?limite=5` - Low stock items
- `GET /api/estoque/modelo/:modelo` - By model
- `GET /api/estoque/relatorio` - Inventory report

### Customers
- `GET /api/clientes/:whatsapp` - Customer profile
- `GET /api/clientes/vips` - VIP customers
- `GET /api/clientes/inativos?dias=30` - Inactive customers
- `GET /api/clientes/relatorio` - Customer report

### Orders
- `GET /api/entregas-pendentes` - Pending deliveries
- `POST /api/webhook/whatsapp` - Receive messages
- `GET /api/webhook/whatsapp` - Webhook verification

## 💬 Message Types Detected

| Message | Type | Expected Response |
|---------|------|-------------------|
| "2 zara g bordô 150" | NOVO_PEDIDO | Creates order, asks for delivery type |
| "entrega" | CONFIRMAR_ENTREGA | Asks for address |
| "retirada" | CONFIRMAR_ENTREGA | Asks for time |
| "paguei no pix" | CONFIRMAR_PAGAMENTO | Confirms payment |
| "qual meu pedido" | CONSULTAR_PEDIDO | Shows order status |
| "rua das flores 123" | FORNECER_INFORMACAO | Saves address, asks payment |
| "cancelar" | CANCELAR | Cancels current order |

## 🗂️ File Locations

| What | Where |
|------|-------|
| Environment | `.env` |
| Logs | `logs/` |
| Source code | `src/` |
| Tests | (will be added) |
| Documentation | `*.md` files |

## 🔧 Configuration

Essential `.env` variables:
```bash
GOOGLE_SHEETS_ID=your_sheet_id
GOOGLE_SHEETS_CREDENTIALS_PATH=./service-account.json
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
WHATSAPP_ACCESS_TOKEN=your_token
WHATSAPP_VERIFY_TOKEN=your_verify_token
ANTHROPIC_API_KEY=your_api_key
AUTHORIZED_WHATSAPP_NUMBERS=+5595988123456,+5595987654321
```

## 📊 Google Sheets Structure

4 sheets required:
- **ESTOQUE** - Products with quantities
- **PEDIDOS_E_VENDAS** - Order history
- **CLIENTES** - Customer database
- **CONVERSAS** - Conversation context (auto-created)

## 🧪 Testing Checklist

- [ ] Server starts: `npm run dev`
- [ ] Health check: `curl http://localhost:3000/health`
- [ ] Google Sheets connected
- [ ] CONVERSAS sheet has correct headers
- [ ] AUTHORIZED_WHATSAPP_NUMBERS set
- [ ] Test new order flow (PHASE2_TEST.md)
- [ ] Verify context saved in CONVERSAS sheet
- [ ] Test with 3+ different customers

## ⚠️ Common Issues

| Issue | Fix |
|-------|-----|
| "Sheets not initialized" | Check service-account.json + GOOGLE_SHEETS_ID |
| Messages not processing | Check AUTHORIZED_WHATSAPP_NUMBERS in .env |
| Context not saving | Verify CONVERSAS sheet exists with correct headers |
| Port 3000 in use | `PORT=3001 npm run dev` |
| ANTHROPIC_API_KEY warning | Optional for Phase 2 basic testing |

## 📈 Data Flow

```
WhatsApp Message
    ↓
webhook.controller.js (receive)
    ↓
conversas.js (detect type + load context)
    ↓
conversas.js (route to handler)
    ↓
[pedidos/pagamento/entrega/query handler]
    ↓
Update CONVERSAS sheet (persist context)
    ↓
Update PEDIDOS_E_VENDAS / CLIENTES sheets
    ↓
sender.js (send response)
    ↓
WhatsApp Response
```

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Project overview |
| `SETUP.md` | 7-step configuration guide |
| `PHASE2_TEST.md` | Detailed test scenarios (8+) |
| `PHASE2_SUMMARY.md` | Technical summary of Phase 2 |
| `PHASE2_QUICKSTART.md` | Quick test guide |
| `IMPLEMENTACAO_LOG.md` | Complete implementation log |
| `REFERENCE_CARD.md` | This file |

## 🎯 Next Phases

**Phase 3** (Analytics):
- Sales analysis
- Best-seller recommendations
- Automatic daily reports at 18:00

**Phase 4** (Production):
- Multi-user support
- Backup automation
- Security hardening

## 🔑 Keyboard Shortcuts (VSCode)

- `Ctrl+~` - Open terminal
- `Ctrl+Shift+P` - Command palette
- `Ctrl+F` - Find in file
- `F5` - Go to definition

## 🐛 Debug Tips

1. Check logs: `tail -f logs/error.log`
2. Verify Google connection: Try creating a customer
3. Test webhook locally: `curl -X POST http://localhost:3000/api/webhook/whatsapp ...`
4. Inspect context: Google Sheets → CONVERSAS → Column C

## ✨ Key Features

✅ Natural language order processing (Claude API)  
✅ Multi-turn conversations with context persistence  
✅ Automatic inventory management  
✅ Customer history tracking  
✅ Payment & delivery status tracking  
✅ WhatsApp integration  
✅ REST API for analytics  
✅ Comprehensive logging  

---

**Need help?** See `SETUP.md` (config) or `PHASE2_TEST.md` (testing)
