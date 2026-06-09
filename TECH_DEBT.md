# 📋 Dívida Técnica — Pluma Pijamas

Registro de código dormente / pendências de limpeza a tratar em **janela de
manutenção programada**. Nada aqui está causando disparo, custo de API ou bug —
é limpeza estética/estrutural adiada por decisão de negócio (risco > valor agora).

---

## 1. Módulo VIP dormente (decisão: 2026-06)

**Contexto:** o módulo VIP foi amputado nos pontos que geravam disparos/UI
(job semanal de recomendações, notificação de "novo VIP", bloco no relatório
diário, endpoint `/api/clientes/vips`, opções VIP nos dropdowns do painel).

**Decisão do dono (Felipe):** NÃO remover as funções internas abaixo agora.
Elas **não disparam mais nada** (todos os consumidores foram cortados), mas estão
entrelaçadas no relatório diário que funciona perfeitamente. Remover só por
estética cria risco inaceitável de desestabilizar esse relatório.

### Funções dormentes a remover na limpeza profunda futura:

| Arquivo | Símbolo | Observação |
|---|---|---|
| `src/services/sqlite/clientes.js` | `listarVIPs()` | Query de clientes com `total_gasto >= 500`. Sem consumidor ativo. |
| `src/services/business/clientes.js` | `listarVIPs()` + função que a consome (~L36-50, L152) | Wrapper de negócio. |
| `src/services/business/analytics.js` | campo `vips` em `analisarClientes()` (~L143) | Ainda calculado dentro de `gerarRelatorioDiario`. **Cuidado:** o relatório diário depende de `analisarClientes`; remover só o campo `vips`, validar o relatório. |
| `src/services/sqlite/leads.js` | flag `isVip` / promoção automática a `status='vip'` em `atualizarTotalGastoLead` | Ainda marca o label `vip` no lead ao atingir R$500. Não notifica ninguém. Avaliar se o status 'vip' ainda é usado em `listarClientesParaMerchan` antes de remover. |

### Plano sugerido para a janela de manutenção:
1. Confirmar com grep que nenhum consumidor novo passou a chamar essas funções.
2. Remover de baixo p/ cima (sqlite → business → analytics), rodando o servidor
   e validando o **relatório diário** após cada remoção.
3. Remover o label `vip` do enum de status de lead (se confirmado sem uso).
4. Testar em terminal antes de deploy (padrão do projeto).

---

_Última atualização: 2026-06 — escopo técnico do ciclo encerrado e trancado._
