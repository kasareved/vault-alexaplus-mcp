'use strict';
// VaultAlexa+ : an MCP server (JSON-RPC 2.0 over HTTP) with zero dependencies.
// All data is a mock in-memory "vault". Replace the mock functions with real
// Amazon / AWS calls when you connect this to a live Alexa+ add-on.
const http = require('http');
const fs = require('fs');
const path = require('path');

const round = n => Math.round(n * 100) / 100;
const DAY = 86400000;

// ---------- mock data ----------
const vault = {
  balance: 1850,
  budgets: {
    shopping: { limit: 300, spent: 120 },
    groceries: { limit: 400, spent: 310 },
    entertainment: { limit: 120, spent: 45 },
    electronics: { limit: 250, spent: 0 },
  },
  bills: [
    { name: 'Rent', amount: 900, dueInDays: 6 },
    { name: 'Internet', amount: 45, dueInDays: 9 },
    { name: 'Electricity', amount: 80, dueInDays: 14 },
  ],
  goal: { name: 'Emergency fund', target: 2000, saved: 900, monthly: 150 },
  household: ['Aisha', 'Michael'],
  watchlist: [],
  transactions: [],
  splits: [],
};
const seller = {
  store: 'Apex Tech Store',
  revenueToday: 842.5,
  ordersToday: 31,
  pendingShipments: 7,
  inventory: [
    { asin: 'B0ECHO001', name: 'Echo Dot stand', stock: 40, dailyVelocity: 12, leadTimeDays: 5, price: 19.99 },
    { asin: 'B0CABLE02', name: 'USB-C cable 2m', stock: 310, dailyVelocity: 9, leadTimeDays: 7, price: 9.49 },
  ],
};

// ---------- tool registry ----------
const tools = {};
function tool(name, description, props, required, fn) {
  tools[name] = { def: { name, description, inputSchema: { type: 'object', properties: props, required } }, fn };
}
const S = { type: 'string' }, N = { type: 'number' };
const dueSoon = days => vault.bills.filter(b => b.dueInDays <= days).reduce((s, b) => s + b.amount, 0);

tool('get_financial_summary', 'Balance, budget status per category and upcoming bills.', {}, [], () => ({
  balance: vault.balance,
  budgets: Object.fromEntries(Object.entries(vault.budgets).map(([k, b]) => [k, { ...b, remaining: round(b.limit - b.spent) }])),
  upcomingBills: vault.bills,
  savingsGoal: vault.goal,
}));

tool('validate_purchase_safety', 'Check a purchase against its category budget and bills due in 14 days.',
  { itemName: S, itemPrice: N, category: S }, ['itemName', 'itemPrice', 'category'], a => {
    const b = vault.budgets[a.category];
    if (!b) throw new Error(`Unknown category "${a.category}". Use: ${Object.keys(vault.budgets).join(', ')}`);
    const remaining = round(b.limit - b.spent);
    const safeCash = round(vault.balance - dueSoon(14));
    const reasons = [];
    let verdict = 'approved';
    if (a.itemPrice > safeCash) { verdict = 'blocked'; reasons.push(`Cash left after bills due in 14 days is $${safeCash}, below the price.`); }
    else if (a.itemPrice > remaining) { verdict = 'caution'; reasons.push(`Over the ${a.category} budget by $${round(a.itemPrice - remaining)}.`); }
    else reasons.push(`Fits the ${a.category} budget with $${round(remaining - a.itemPrice)} to spare.`);
    return { item: a.itemName, verdict, reasons, requiresVoiceConfirmation: a.itemPrice >= 100 && verdict !== 'blocked' };
  });

tool('calculate_opportunity_cost', 'Anti-impulse check: how far a purchase delays the savings goal.',
  { itemName: S, itemPrice: N }, ['itemName', 'itemPrice'], a => {
    const months = round(a.itemPrice / vault.goal.monthly);
    const cooldown = a.itemPrice >= 75;
    return {
      item: a.itemName,
      goal: vault.goal.name,
      delayMonths: months,
      message: `Buying this delays "${vault.goal.name}" by about ${months} month(s).`,
      cooldownSuggested: cooldown,
      cooldownEndsAt: cooldown ? new Date(Date.now() + DAY).toISOString() : null,
    };
  });

tool('predict_monthly_runway', 'Forecast end-of-month balance from upcoming bills and expected spend.',
  { projectedSpend: N }, [], a => {
    const bills = dueSoon(31), spend = a.projectedSpend ?? 250;
    const end = round(vault.balance - bills - spend);
    return { balance: vault.balance, upcomingBills: bills, projectedSpend: spend, projectedEndBalance: end,
      risk: end < 0 ? 'deficit' : end < 300 ? 'tight' : 'healthy' };
  });

tool('negotiate_dynamic_discount', 'Simulated buyer-seller negotiation that returns a voucher.',
  { itemName: S, currentPrice: N }, ['itemName', 'currentPrice'], a => {
    const pct = a.currentPrice >= 200 ? 12 : a.currentPrice >= 75 ? 8 : 5;
    const newPrice = round(a.currentPrice * (1 - pct / 100));
    return { simulated: true, item: a.itemName, originalPrice: a.currentPrice, discountPercent: pct, newPrice,
      voucher: 'VAULT-' + Buffer.from(a.itemName).toString('hex').slice(0, 6).toUpperCase() + pct,
      expiresAt: new Date(Date.now() + DAY).toISOString() };
  });

tool('track_price_drop_target', 'Add an item to the price-drop watchlist.',
  { itemName: S, targetPrice: N }, ['itemName', 'targetPrice'], a => {
    vault.watchlist.push({ item: a.itemName, targetPrice: a.targetPrice });
    return { watching: vault.watchlist.length, latest: a };
  });

tool('log_transaction', 'Record a spend and update the category budget.',
  { title: S, amount: N, category: S }, ['title', 'amount', 'category'], a => {
    const b = vault.budgets[a.category];
    if (!b) throw new Error(`Unknown category "${a.category}".`);
    b.spent = round(b.spent + a.amount);
    vault.balance = round(vault.balance - a.amount);
    vault.transactions.push({ ...a, at: new Date().toISOString() });
    return { logged: a.title, newBalance: vault.balance, categoryRemaining: round(b.limit - b.spent) };
  });

tool('split_shared_expense', 'Split a household expense equally and queue requests.',
  { title: S, totalAmount: N, members: { type: 'array', items: S } }, ['title', 'totalAmount'], a => {
    const people = a.members && a.members.length ? a.members : vault.household;
    const share = round(a.totalAmount / (people.length + 1));
    const split = { title: a.title, share, requests: people.map(p => ({ to: p, amount: share, status: 'pending' })) };
    vault.splits.push(split);
    return split;
  });

tool('predict_inventory_stockout', 'Seller: days of stock left and a draft purchase order.',
  { asin: S, dailyVelocity: N }, ['asin'], a => {
    const item = seller.inventory.find(i => i.asin === a.asin);
    if (!item) throw new Error(`Unknown ASIN. Known: ${seller.inventory.map(i => i.asin).join(', ')}`);
    const v = a.dailyVelocity || item.dailyVelocity;
    const daysLeft = round(item.stock / v);
    const qty = Math.max(0, Math.ceil(v * (item.leadTimeDays + 14)) - item.stock);
    return { asin: item.asin, name: item.name, daysLeft, status: daysLeft <= item.leadTimeDays ? 'reorder-now' : 'ok',
      draftPurchaseOrder: qty ? { id: 'PO-' + item.asin.slice(-3) + '-' + qty, quantity: qty, needsSellerApproval: true } : null };
  });

tool('generate_morning_briefing', 'Daily briefing for a buyer or a seller.',
  { role: { type: 'string', enum: ['buyer', 'seller'] } }, [], a => {
    if (a.role === 'seller') {
      const low = seller.inventory.filter(i => i.stock / i.dailyVelocity <= i.leadTimeDays + 2).map(i => i.name);
      return { role: 'seller', store: seller.store, revenueToday: seller.revenueToday, orders: seller.ordersToday,
        pendingShipments: seller.pendingShipments, stockAlerts: low };
    }
    return { role: 'buyer', balance: vault.balance, billsDueIn7Days: vault.bills.filter(b => b.dueInDays <= 7),
      watchlist: vault.watchlist, tip: 'Ask me before any purchase over $100.' };
  });

// ---------- resources & prompts ----------
const resources = [
  { uri: 'vault://financial/overview', name: 'Financial overview', mimeType: 'application/json', read: () => ({ balance: vault.balance, budgets: vault.budgets, bills: vault.bills }) },
  { uri: 'vault://household/summary', name: 'Household summary', mimeType: 'application/json', read: () => ({ members: vault.household, splits: vault.splits }) },
];
const prompts = {
  financial_health_audit: { description: 'Audit my finances and suggest three changes.',
    text: 'Read vault://financial/overview, call predict_monthly_runway, then suggest three concrete changes in plain language.' },
};

// ---------- JSON-RPC ----------
function handle(msg) {
  const id = msg && msg.id;
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(-32600, 'Invalid Request');
  if (id === undefined) return null; // notification: no reply
  const p = msg.params || {};
  switch (msg.method) {
    case 'initialize':
      return ok({ protocolVersion: p.protocolVersion || '2025-11-25',
        capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: 'vaultalexa-plus', version: '1.0.0' } });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: Object.values(tools).map(t => t.def) });
    case 'tools/call': {
      const t = tools[p.name];
      if (!t) return err(-32602, `Unknown tool: ${p.name}`);
      const args = p.arguments || {};
      try {
        for (const [k, schema] of Object.entries(t.def.inputSchema.properties)) {
          if (args[k] === undefined) { if (t.def.inputSchema.required.includes(k)) throw new Error(`Missing argument: ${k}`); continue; }
          const type = schema.type, v = args[k];
          if ((type === 'number' && typeof v !== 'number') || (type === 'string' && typeof v !== 'string') || (type === 'array' && !Array.isArray(v)))
            throw new Error(`Argument "${k}" must be a ${type}`);
        }
        return ok({ content: [{ type: 'text', text: JSON.stringify(t.fn(args), null, 2) }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: e.message }], isError: true });
      }
    }
    case 'resources/list': return ok({ resources: resources.map(({ read, ...r }) => r) });
    case 'resources/read': {
      const r = resources.find(x => x.uri === p.uri);
      if (!r) return err(-32002, 'Resource not found');
      return ok({ contents: [{ uri: r.uri, mimeType: r.mimeType, text: JSON.stringify(r.read(), null, 2) }] });
    }
    case 'prompts/list': return ok({ prompts: Object.entries(prompts).map(([name, v]) => ({ name, description: v.description })) });
    case 'prompts/get': {
      const v = prompts[p.name];
      if (!v) return err(-32602, 'Unknown prompt');
      return ok({ description: v.description, messages: [{ role: 'user', content: { type: 'text', text: v.text } }] });
    }
    default: return err(-32601, `Method not found: ${msg.method}`);
  }
}

// ---------- HTTP ----------
function start(port = process.env.PORT || 3000) {
  const server = http.createServer((req, res) => {
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return send(204, '');
    if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok', tools: Object.keys(tools).length });
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html'))
      return send(200, fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && req.url === '/mcp') return send(405, { error: 'Use POST for MCP requests (Streamable HTTP, JSON responses).' });
    if (req.method === 'POST' && req.url === '/mcp') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        let msg;
        try { msg = JSON.parse(body); } catch { return send(200, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
        const out = Array.isArray(msg) ? msg.map(handle).filter(Boolean) : handle(msg);
        if (out === null || (Array.isArray(out) && !out.length)) return send(202, '');
        send(200, out);
      });
      return;
    }
    send(404, { error: 'Not found' });
  });
  return server.listen(port, () => console.log(`VaultAlexa+ MCP server: http://localhost:${port}  (POST /mcp)`));
}

if (require.main === module) start();
module.exports = { handle, start };
