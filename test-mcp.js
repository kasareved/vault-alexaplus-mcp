'use strict';
const assert = require('assert');
for (const k of ['USE_BEDROCK', 'DYNAMODB_TABLE', 'GEMINI_API_KEY']) delete process.env[k];
const { handle } = require('./mcp-server');
let n = 1;
const rpc = (method, params) => handle({ jsonrpc: '2.0', id: n++, method, params });
const call = (name, args) => rpc('tools/call', { name, arguments: args });
const data = r => JSON.parse(r.result.content[0].text);

(async () => {
  assert.strictEqual((await rpc('initialize', { protocolVersion: '2025-11-25' })).result.serverInfo.name, 'vaultalexa-plus');
  assert.strictEqual((await rpc('initialize', {})).result.protocolVersion, '2025-11-25');
  assert.strictEqual(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.strictEqual((await rpc('tools/list')).result.tools.length, 12);
  assert.strictEqual((await rpc('resources/list')).result.resources.length, 2);
  assert.strictEqual((await rpc('prompts/list')).result.prompts.length, 1);

  assert.strictEqual(data(await call('validate_purchase_safety', { itemName: 'Mouse', itemPrice: 30, category: 'shopping' })).verdict, 'approved');
  assert.strictEqual(data(await call('validate_purchase_safety', { itemName: 'Monitor', itemPrice: 500, category: 'electronics' })).verdict, 'caution');
  assert.strictEqual(data(await call('validate_purchase_safety', { itemName: 'Laptop', itemPrice: 1200, category: 'electronics' })).verdict, 'blocked');
  assert.strictEqual((await call('validate_purchase_safety', { itemName: 'X', itemPrice: 'free', category: 'shopping' })).result.isError, true);
  assert.strictEqual((await call('validate_purchase_safety', { itemName: 'X', itemPrice: 5, category: 'nope' })).result.isError, true);
  assert.strictEqual(data(await call('calculate_opportunity_cost', { itemName: 'TV', itemPrice: 300 })).delayMonths, 2);
  assert.strictEqual(data(await call('predict_monthly_runway', { projectedSpend: 900 })).risk, 'deficit');
  assert.strictEqual(data(await call('negotiate_dynamic_discount', { itemName: 'Echo Show', currentPrice: 100 })).newPrice, 92);
  assert.strictEqual(data(await call('split_shared_expense', { title: 'Groceries', totalAmount: 90 })).share, 30);
  assert.strictEqual(data(await call('predict_inventory_stockout', { asin: 'B0ECHO001' })).status, 'reorder-now');
  assert.strictEqual(data(await call('generate_morning_briefing', { role: 'seller' })).role, 'seller');

  const before = data(await call('get_financial_summary', {})).balance;
  const logged = data(await call('log_transaction', { title: 'Coffee', amount: 10, category: 'groceries' }));
  assert.strictEqual(logged.storage.stored, 'memory');
  assert.strictEqual(data(await call('get_financial_summary', {})).balance, before - 10);

  // integrations: off by default, mock fallback
  assert.strictEqual(data(await call('ask_vault_advisor', { question: 'Can I spend more?' })).source, 'rule-based');
  assert.strictEqual(data(await call('analyze_product_image_listing', { hintProductName: 'Desk lamp' })).source, 'simulated');
  assert.strictEqual((await call('analyze_product_image_listing', {})).result.isError, true);

  // integrations: enabled but SDK missing in this environment -> safe fallback
  process.env.USE_BEDROCK = '1';
  const adv = data(await call('ask_vault_advisor', { question: 'Can I spend more?' }));
  assert.strictEqual(adv.source, 'rule-based');
  delete process.env.USE_BEDROCK;

  assert.strictEqual((await rpc('nope')).error.code, -32601);
  console.log('All MCP tests passed (12 tools, 2 resources, 1 prompt).');
})().catch(e => { console.error(e); process.exit(1); });
