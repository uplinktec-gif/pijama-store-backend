# 📡 Documentação da API - Pijama Store

Complete API reference com exemplos de requisições e respostas.

## Base URL

```
http://localhost:3000
```

## Autenticação

Endpoints admin requerem `whatsapp` como query parameter.

## Health Check

```
GET /health
```

Retorna status do servidor.

## Estoque

### Listar Estoque Completo

```
GET /api/estoque
```

Retorna todos os produtos com informações de quantidade.

### Produtos com Estoque Baixo

```
GET /api/estoque/baixo?limite=5
```

Parâmetros:
- `limite` (opcional): Limiar de quantidade baixa

### Produtos por Modelo

```
GET /api/estoque/modelo/:modelo
```

Modelos: ZARA, MIA, LIA, NÚBIA, LÍVIA, BEATRIZ, ANNE

### Relatório de Estoque

```
GET /api/estoque/relatorio
```

Gera análise detalhada do estoque.

## Clientes

### Perfil do Cliente

```
GET /api/clientes/:whatsapp
```

Parâmetros:
- `whatsapp`: Número do WhatsApp

### Clientes VIP

```
GET /api/clientes/vips
```

Retorna os 10 clientes com maior gasto total.

### Clientes Inativos

```
GET /api/clientes/inativos?dias=30
```

Parâmetros:
- `dias` (opcional): Dias desde última compra (padrão: 30)

### Relatório de Clientes

```
GET /api/clientes/relatorio
```

Gera análise completa de clientes.

## Pedidos

### Entregas Pendentes

```
GET /api/entregas-pendentes
```

Retorna todos os pedidos aguardando entrega/retirada.

## Backup (Admin Only)

### Último Backup

```
GET /api/backup/latest?whatsapp=5595988123456
```

Retorna informações do último backup.

### Listar Backups

```
GET /api/backup/listar?whatsapp=5595988123456
```

Lista todos os backups (últimos 30 dias).

## Logs (Admin Only)

### Obter Logs

```
GET /api/logs?whatsapp=5595988123456&nivel=ERROR&usuario=5595988123456&limit=50
```

Parâmetros:
- `whatsapp`: Número do admin (obrigatório)
- `nivel`: ERROR, WARN, INFO, DEBUG (opcional)
- `usuario`: Filtro por número WhatsApp (opcional)
- `limit`: Quantidade de linhas (padrão: 100)

## Webhook WhatsApp

### Verificar Webhook

```
GET /api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=seu_token&hub.challenge=desafio
```

### Receber Mensagens

```
POST /api/webhook/whatsapp
```

Processa mensagens do WhatsApp (Meta ou Evolution).

## Códigos de Status

| Código | Significado |
|--------|-----------|
| 200 | OK - Requisição bem-sucedida |
| 403 | Forbidden - Sem permissão |
| 404 | Not Found - Recurso não existe |
| 500 | Internal Server Error |

## Exemplos

### Verificar estoque de um modelo

```bash
curl -s http://localhost:3000/api/estoque/modelo/ZARA
```

### Obter clientes VIP

```bash
curl -s http://localhost:3000/api/clientes/vips
```

### Visualizar logs de erro

```bash
curl -s "http://localhost:3000/api/logs?whatsapp=5595988123456&nivel=ERROR"
```

---
**Versão**: 1.0.0
