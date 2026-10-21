# VaultAlexa+

An MCP server for Alexa+ that gives shoppers a spending safety net and gives sellers an inventory co-pilot.

- **Buyers:** check a purchase against budgets and bills, see how it delays a savings goal, forecast the month, negotiate a voucher, split household costs, watch prices.
- **Sellers:** see stockout risk with a draft purchase order, and get a store briefing.
- **Human in the loop:** purchases of $100 or more need voice confirmation, and purchase orders need seller approval.

## Run it

```bash
npm start        # http://localhost:3000 (console) and POST /mcp (JSON-RPC 2.0)
npm test         # protocol and tool tests
```

No dependencies. Needs Node 18 or newer.

## What is real and what is mocked

All financial and store data is a mock in-memory vault, and the discount negotiation is simulated. Nothing talks to Amazon, AWS or a bank yet. To go live, replace the data in `mcp-server.js` with calls to your own services, then register the `/mcp` endpoint following Amazon's Alexa+ add-on documentation.

## Connecting to Alexa+

This server speaks MCP over Streamable HTTP (JSON responses on `POST /mcp`, protocol 2025-11-25). For the hackathon demo, the browser console simulates the Alexa+ experience. To connect a real Alexa+ add-on you still need to:

1. Expose the server on a public HTTPS URL (for example with a cloudflared tunnel).
2. Add the OAuth pieces Alexa+ expects (401 challenge and metadata documents). These are not implemented in this demo.
3. Onboard with the Alexa AI CLI by following the Alexa+ MCP QuickStart on developer.amazon.com.

## Tools (10)

| Tool                         | Side   | What it does                                         |
| ---------------------------- | ------ | ---------------------------------------------------- |
| `get_financial_summary`      | Buyer  | Balance, budgets, bills                              |
| `validate_purchase_safety`   | Buyer  | approved, caution or blocked, with reasons           |
| `calculate_opportunity_cost` | Buyer  | Savings-goal delay and a 24-hour cooldown suggestion |
| `predict_monthly_runway`     | Buyer  | End-of-month balance and risk level                  |
| `negotiate_dynamic_discount` | Buyer  | Simulated voucher                                    |
| `track_price_drop_target`    | Buyer  | Watchlist entry                                      |
| `log_transaction`            | Buyer  | Updates balance and budget                           |
| `split_shared_expense`       | Buyer  | Equal split with pending requests                    |
| `predict_inventory_stockout` | Seller | Days left and draft purchase order                   |
| `generate_morning_briefing`  | Both   | Role-aware daily briefing                            |

Plus 2 resources (`vault://financial/overview`, `vault://household/summary`) and 1 prompt (`financial_health_audit`).

## Try it with curl

```bash
curl -s localhost:3000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"validate_purchase_safety","arguments":{"itemName":"Headphones","itemPrice":219,"category":"electronics"}}}'
```

## Credits

Author: VEDANT KASARE. Built for the Amazon Developer Hackathon 2026.

License: MIT
