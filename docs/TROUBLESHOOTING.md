# Troubleshooting Guide - Pijama Store Backend

## Table of Contents
1. [Google Sheets Errors](#google-sheets-errors)
2. [WhatsApp Errors](#whatsapp-errors)
3. [Claude API Errors](#claude-api-errors)
4. [Permission and Authentication Errors](#permission-and-authentication-errors)
5. [Logging and Debugging](#logging-and-debugging)
6. [Backup Issues](#backup-issues)
7. [Test Failures](#test-failures)
8. [Data Recovery](#data-recovery)
9. [Performance Troubleshooting](#performance-troubleshooting)

---

## Google Sheets Errors

### Error: `401 Unauthorized` when accessing Google Sheets

**Symptom**: Logs show "Error: 401 Unauthorized" when trying to read from Google Sheets.

**Causes**:
- Service Account credentials expired
- GOOGLE_SHEETS_CREDENTIALS_PATH points to wrong file
- service-account.json is corrupted or invalid

**Solutions**:
1. Verify the path in `.env`:
   ```
   cat .env | grep GOOGLE_SHEETS_CREDENTIALS_PATH
   ```

2. Regenerate the Service Account:
   - Go to Google Cloud Console
   - Select your project
   - Navigate to Service Accounts
   - Delete old key, create new key as JSON
   - Replace your local service-account.json
   - Restart: npm run dev

### Error: `Product not found in estoque`

**Symptom**: Order parsing returns "Produto não encontrado".

**Causes**:
- Product doesn't exist in ESTOQUE sheet
- Model name doesn't match exactly
- Stock sheet not populated

**Solutions**:
1. Check ESTOQUE sheet: curl -X GET http://localhost:3000/api/estoque
2. Verify product exists in Google Sheets
3. Populate estoque: node scripts/seed-estoque.js

---

## WhatsApp Errors

### Error: `Cannot POST /message/send`

**Symptom**: WhatsApp response fails with 404 or 500 error.

**Causes**:
- WhatsApp token expired
- Phone Number ID incorrect
- Message payload malformed

**Solutions**:
1. Verify WhatsApp credentials in .env
2. Regenerate token from Meta Business Platform
3. Update .env and restart server

### Error: `Messages not received`

**Symptom**: System logs message sent but nothing arrives.

**Causes**:
- Phone number format incorrect (needs +55)
- Business phone not linked
- Message queued but not delivered

**Solutions**:
1. Verify number format includes +55
2. Check Meta Dashboard webhooks
3. Whitelist test number in WhatsApp

---

## Claude API Errors

### Error: `401 Unauthorized`

**Symptom**: "Claude API error: 401 Unauthorized" in logs.

**Solutions**:
1. Verify API key format (sk-ant-)
2. Generate new key from Anthropic Console
3. Update .env and restart

### Error: `429 Too Many Requests`

**Symptom**: Rate limit exceeded.

**Solutions**:
1. Add request queue
2. Monitor API usage
3. Implement delays between requests

---

## Permission Errors

### Error: `403 Forbidden`

**Symptom**: User gets "Você não tem permissão".

**Solutions**:
1. Verify user is ADMIN in config/users.js
2. Check ?whatsapp=NUMBER parameter
3. Ensure admin number matches .env

### Error: `Unauthorized WhatsApp number`

**Symptom**: Message from unrecognized number ignored.

**Solutions**:
1. Check AUTHORIZED_WHATSAPP_NUMBERS in .env
2. Add new number to list
3. Restart server

---

## Logging and Debugging

### Enable Debug Logging

```
LOG_LEVEL=debug npm run dev
```

### Error: `Logs file not found`

**Symptom**: /api/logs returns not found.

**Solutions**:
1. Generate logs by sending message
2. Check logs directory exists
3. Verify datePattern in logger.js

---

## Backup Issues

### Error: `Backup directory not found`

**Symptom**: Scheduled backup fails with ENOENT.

**Solutions**:
1. Create directory: mkdir -p ./backups
2. Verify permissions
3. Restart backup service

### Error: `Backup file corrupted`

**Symptom**: File is invalid JSON.

**Solutions**:
1. Validate file: cat ./backups/*.json | jq .
2. Delete corrupted file
3. Trigger manual backup

---

## Test Failures

### Error: `MODULE_NOT_FOUND`

**Symptom**: npm test shows import errors.

**Solutions**:
1. Check Jest config
2. Fix import paths
3. Run: npm test -- --verbose

### Error: `Test timeout`

**Symptom**: Test exceeds 5000ms.

**Solutions**:
1. Increase timeout
2. Mock Google Sheets API
3. Close connections after test

---

## Data Recovery

### Accidental deletion of orders

**Steps**:
1. Check backup exists: ls ./backups/
2. Restore from backup
3. Verify data is correct

### Wrong product quantities

**Steps**:
1. Export ESTOQUE from backup
2. Compare with current
3. Recalculate formulas
4. Test endpoint

---

## Performance

### Slow responses (> 10s)

**Causes**: Claude API slow, quota throttling, latency

**Solutions**:
1. Profile response times
2. Optimize Claude prompt
3. Cache results
4. Monitor API quotas

### High memory usage (500MB+)

**Causes**: Memory leak, logs accumulating, connections not released

**Solutions**:
1. Monitor: watch -n 1 'ps aux | grep node'
2. Restart daily
3. Review long-running requests

---

**Last Updated**: 2026-05-18
**Version**: Phase 4 - Complete
