// PayZap — Servidor principal
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import chargesRouter  from './routes/charges.js';
import webhooksRouter from './routes/webhooks.js';
import balanceRouter  from './routes/balance.js';
import configRouter   from './routes/config.js';
import { requireApiKey, generateApiToken } from './middleware/auth.js';
import { getCharge } from './providers/index.js';
import { cfg, PROVIDER } from './config.js';
import { db } from './db.js';

import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Servir Frontend (Arquivos Estáticos) ──────────────────────────────────────
app.use(express.static(path.join(__dirname, '../')));

// ── Middlewares globais ───────────────────────────────────────────────────────

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:5500',  // Live Server (VS Code)
    'http://127.0.0.1:8080',
    cfg.publicUrl,
  ],
  credentials: true,
}));

// Raw body para validação de webhooks (assinatura HMAC exige body original)
app.use('/webhook', express.raw({ type: 'application/json' }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) req.rawBody = req.body.toString();
  next();
});
app.use(express.json());

// Rate limiting — protege a API de cobranças
const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minuto
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em instantes.' },
});
app.use('/api', limiter);

// ── Rotas públicas ────────────────────────────────────────────────────────────

// Health check
app.get('/health', (_req, res) => res.json({
  ok: true,
  provider: PROVIDER,
  env: cfg[PROVIDER]?.sandbox ? 'sandbox' : 'production',
  ts: new Date().toISOString(),
}));

// Webhooks (sem auth — autenticação é feita por assinatura/mTLS do provedor)
app.use('/webhook', webhooksRouter);

// Token para o painel (em produção, substitua por login real)
app.post('/auth/token', (req, res) => {
  // Validação simples para demo — implemente autenticação real
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Credenciais inválidas' });
  // TODO: validar contra banco de dados
  res.json({ token: generateApiToken(), provider: PROVIDER });
});

// ── Rotas protegidas (requerem token) ─────────────────────────────────────────

// Checkout pode criar cobranças sem auth (é chamado pelo frontend público)
// Em produção, adicione validação por product_id assinado ou session
app.use('/api/charges', chargesRouter);
app.use('/api/balance', requireApiKey, balanceRouter);
app.use('/api/config',  configRouter);

// Database endpoints
app.get('/api/transactions', async (req, res) => {
  res.json(await db.getTransactions());
});

app.get('/api/products', async (req, res) => {
  res.json(await db.getProducts());
});

app.post('/api/products', async (req, res) => {
  await db.saveProduct(req.body);
  res.json({ ok: true });
});

app.delete('/api/products/:id', async (req, res) => {
  await db.deleteProduct(req.params.id);
  res.json({ ok: true });
});

// ── Inicialização ─────────────────────────────────────────────────────────────

app.listen(cfg.port, () => {
  console.log(`
╔══════════════════════════════════════════╗
║         PayZap Gateway — Online          ║
╠══════════════════════════════════════════╣
║  Porta    : ${String(cfg.port).padEnd(28)}║
║  Provedor : ${PROVIDER.padEnd(28)}║
║  Ambiente : ${(cfg[PROVIDER]?.sandbox ? 'sandbox' : 'production').padEnd(28)}║
║  URL      : http://localhost:${String(cfg.port).padEnd(13)}║
╚══════════════════════════════════════════╝
  `);
});

export default app;
