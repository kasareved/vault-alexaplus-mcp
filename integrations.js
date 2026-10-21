'use strict';
// Optional live integrations. Everything here is OFF unless you set environment
// variables (see .env.example). When off or failing, the server falls back to mock data.

const cfg = () => ({
  region: process.env.AWS_REGION || 'us-east-1',
  useBedrock: process.env.USE_BEDROCK === '1',
  modelId: process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-lite-v1:0',
  table: process.env.DYNAMODB_TABLE || '',
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
});

function optional(name) {
  try { return require(name); } catch { return null; }
}
const need = name => { throw new Error(`Package ${name} is not installed. Run: npm install`); };

function status() {
  const c = cfg();
  return { bedrock: c.useBedrock, dynamodb: Boolean(c.table), gemini: Boolean(c.geminiKey) };
}

// ---- Amazon Bedrock (Converse API) ----
let bedrockClient = null;
async function askBedrock(prompt) {
  const c = cfg();
  const sdk = optional('@aws-sdk/client-bedrock-runtime') || need('@aws-sdk/client-bedrock-runtime');
  bedrockClient = bedrockClient || new sdk.BedrockRuntimeClient({ region: c.region });
  const out = await bedrockClient.send(new sdk.ConverseCommand({
    modelId: c.modelId,
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 400, temperature: 0.3 },
  }));
  return out.output.message.content.map(p => p.text || '').join('').trim();
}

// ---- Amazon DynamoDB (table needs partition key "pk" and sort key "sk", both String) ----
let ddbClient = null;
async function saveTransaction(tx) {
  const c = cfg();
  if (!c.table) return { stored: 'memory' };
  try {
    const sdk = optional('@aws-sdk/client-dynamodb') || need('@aws-sdk/client-dynamodb');
    ddbClient = ddbClient || new sdk.DynamoDBClient({ region: c.region });
    await ddbClient.send(new sdk.PutItemCommand({
      TableName: c.table,
      Item: {
        pk: { S: 'user#demo' },
        sk: { S: `${tx.at}#${Math.random().toString(36).slice(2, 8)}` },
        title: { S: tx.title },
        amount: { N: String(tx.amount) },
        category: { S: tx.category },
      },
    }));
    return { stored: 'dynamodb', table: c.table };
  } catch (e) {
    return { stored: 'memory', note: `DynamoDB unavailable: ${e.message}` };
  }
}

// ---- Google Gemini (REST, image -> listing draft) ----
async function geminiListing({ imageBase64, mimeType, hint }) {
  const c = cfg();
  const instruction = 'You write Amazon product listings from a product photo. Reply with JSON only: ' +
    '{"title":"","bullets":["","",""],"description":"","category":""}.' + (hint ? ` Product hint: ${hint}.` : '');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${c.geminiModel}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.geminiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: instruction }, { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini request failed (HTTP ${res.status})`);
  const json = await res.json();
  const text = (json.candidates && json.candidates[0] && json.candidates[0].content.parts.map(p => p.text || '').join('')) || '';
  return JSON.parse(text);
}

module.exports = { cfg, status, askBedrock, saveTransaction, geminiListing };
