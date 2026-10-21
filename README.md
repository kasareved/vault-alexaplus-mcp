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

Runs with no installs on Node 18 or newer (use Node 20.6+ for `npm run start:live`). The AWS SDK is only needed if you turn on the optional live integrations below.

## What is real and what is mocked

By default all financial and store data is a mock in-memory vault, the discount negotiation is simulated, and nothing talks to Amazon, AWS, Google or a bank. Three integrations are built in but **off until you add your own keys**. Check `GET /health` to see which ones are switched on.

## Optional live integrations

Copy `.env.example` to `.env`, fill in what you want, then run `npm install` and `npm run start:live`. Never commit `.env`.

| Integration                   | Enable with                                        | Used by                         | If off or failing       |
| ----------------------------- | -------------------------------------------------- | ------------------------------- | ----------------------- |
| Amazon Bedrock (Converse API) | `USE_BEDROCK=1`, AWS keys, `BEDROCK_MODEL_ID`      | `ask_vault_advisor`             | Rule-based answer       |
| Amazon DynamoDB               | `DYNAMODB_TABLE` (keys `pk` and `sk`, both String) | `log_transaction`               | Kept in memory          |
| Google Gemini                 | `GEMINI_API_KEY`                                   | `analyze_product_image_listing` | Simulated draft listing |

The responses say which source answered (`amazon-bedrock`, `google-gemini`, `dynamodb`, `rule-based`, `simulated`, or `memory`).

## Connecting to Alexa+

This server speaks MCP over Streamable HTTP (JSON responses on `POST /mcp`, protocol 2025-11-25). For the hackathon demo, the browser console simulates the Alexa+ experience. To connect a real Alexa+ add-on you still need to:

1. Expose the server on a public HTTPS URL (for example with a cloudflared tunnel).
2. Add the OAuth pieces Alexa+ expects (401 challenge and metadata documents). These are not implemented in this demo.
3. Onboard with the Alexa AI CLI by following the Alexa+ MCP QuickStart on developer.amazon.com.

## Tools (12)

| Tool                            | Side   | What it does                                                               |
| ------------------------------- | ------ | -------------------------------------------------------------------------- |
| `get_financial_summary`         | Buyer  | Balance, budgets, bills                                                    |
| `validate_purchase_safety`      | Buyer  | approved, caution or blocked, with reasons                                 |
| `calculate_opportunity_cost`    | Buyer  | Savings-goal delay and a 24-hour cooldown suggestion                       |
| `predict_monthly_runway`        | Buyer  | End-of-month balance and risk level                                        |
| `negotiate_dynamic_discount`    | Buyer  | Simulated voucher                                                          |
| `track_price_drop_target`       | Buyer  | Watchlist entry                                                            |
| `log_transaction`               | Buyer  | Updates balance and budget                                                 |
| `split_shared_expense`          | Buyer  | Equal split with pending requests                                          |
| `predict_inventory_stockout`    | Seller | Days left and draft purchase order                                         |
| `generate_morning_briefing`     | Both   | Role-aware daily briefing                                                  |
| `ask_vault_advisor`             | Buyer  | Plain-language advice, Bedrock when enabled                                |
| `analyze_product_image_listing` | Seller | Draft listing from a photo (Gemini) or product name, needs seller approval |

Plus 2 resources (`vault://financial/overview`, `vault://household/summary`) and 1 prompt (`financial_health_audit`).

## Try it with curl

```bash
curl -s localhost:3000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"validate_purchase_safety","arguments":{"itemName":"Headphones","itemPrice":219,"category":"electronics"}}}'
```

## Credits

Author: VEDANT KASARE . Built for the Amazon Developer Hackathon 2026.

License: MIT
