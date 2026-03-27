// PayZap — Provedor Stone (OpenBank)
// Docs: https://docs.openbank.stone.com.br
//
// Autenticação: OAuth2 + JWT Client Assertion (RS256, RSA 4096)
// Token expira em 15 minutos. Renovação automática.
//
// ATENÇÃO: Integração Pix da Stone está em Alpha (acesso limitado).
// Contato: parcerias@openbank.stone.com.br

import fs from 'fs';
import axios from 'axios';
import { SignJWT, importPKCS8 } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { cfg } from '../config.js';

// ── Token cache ──────────────────────────────────────────────────────────────
let _token = null;
let _tokenExpiresAt = 0;
let _tokenPromise = null; // evita race condition em requisições paralelas

async function getPrivateKey() {
  const path = cfg.stone.privateKeyPath;
  if (!fs.existsSync(path)) {
    throw new Error(`[Stone] Chave privada não encontrada: ${path}. Gere com: openssl genrsa -out stone-private.pem 4096`);
  }
  const pem = fs.readFileSync(path, 'utf8');
  return importPKCS8(pem, 'RS256');
}

async function getToken() {
  // Renova com 60s de margem (token válido por 15min = 900s)
  if (_token && Date.now() < _tokenExpiresAt) return _token;
  // Coalesce: se já há uma renovação em andamento, aguarda ela
  if (_tokenPromise) return _tokenPromise;

  _tokenPromise = (async () => {
    const c = cfg.stone;
    const privateKey = await getPrivateKey();
    const now = Math.floor(Date.now() / 1000);

    // JWT Client Assertion conforme spec Stone
    const assertion = await new SignJWT({
      clientId: c.clientId,
      realm: 'stone_bank',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(c.clientId)
      .setSubject(c.clientId)
      .setAudience(c.authUrl())
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 900)  // 15 min
      .setJti(uuidv4())
      .sign(privateKey);

    const params = new URLSearchParams({
      client_id: c.clientId,
      grant_type: 'client_credentials',
      client_assertion: assertion,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    });

    const { data } = await axios.post(c.authUrl(), params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    _token = data.access_token;
    _tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    _tokenPromise = null;
    return _token;
  })();

  return _tokenPromise;
}

function authHeaders(idempotencyKey = null) {
  const h = {
    Authorization: `Bearer ${_token}`,
    'user-agent': 'payzap/1.0',
  };
  if (idempotencyKey) h['x-stone-idempotency-key'] = idempotencyKey;
  return h;
}

async function request(method, path, data = null) {
  await getToken(); // garante token atualizado
  const { data: res } = await axios({
    method,
    url: cfg.stone.baseUrl() + path,
    data,
    headers: authHeaders(uuidv4()),
  });
  return res;
}

// ── Interface pública ────────────────────────────────────────────────────────

/**
 * Cria uma cobrança Pix via Stone.
 * @param {object} p
 * @param {number}  p.amount      - Valor em centavos (ex: 9990 = R$ 99,90)
 * @param {string}  p.name        - Nome do pagador
 * @param {string}  p.cpf         - CPF do pagador
 * @param {string}  p.description - Informação ao pagador
 * @param {string}  p.externalId  - ID externo
 */
export async function createCharge({ amount, name, cpf, description, externalId }) {
  const c = cfg.stone;
  // Stone usa centavos
  const amountCents = Math.round(amount * 100);
  const txid = (externalId || uuidv4()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 35);

  const body = {
    amount: amountCents,
    account_id: c.accountId,
    key: c.pixKey,
    transaction_id: txid,
    customer: {
      name: name || 'Comprador',
      document: cpf?.replace(/\D/g, '') || '',
    },
    request_for_payer: description || 'Pagamento PayZap',
  };

  const data = await request('post', '/api/v1/pix_payment_invoices', body);
  return normalize(data);
}

/**
 * Consulta uma cobrança pelo transaction_id.
 * @param {string} chargeId - transaction_id retornado em createCharge
 */
export async function getCharge(chargeId) {
  const data = await request('get', `/api/v1/pix_payment_invoices/${chargeId}`);
  return normalize(data);
}

/**
 * Solicita devolução de um Pix recebido.
 * @param {string} chargeId - transaction_id (ID retornado em createCharge)
 * @param {number} amount   - Valor em reais (null = total)
 */
export async function refund(chargeId, amount = null) {
  // Stone espera valor em centavos
  const body = amount ? { amount: Math.round(amount * 100) } : {};
  const data = await request('post', `/api/v1/pix_payment_invoices/${chargeId}/refund`, body);
  return { refundId: data.id || data.refund_id, status: data.status, raw: data };
}

/**
 * Valida webhook Stone.
 * Stone envia payload JWE (criptografado com chave pública do cliente).
 * Descriptografia completa requer jose + chave privada RSA 2048.
 * @param {string} jweToken - Token JWE do body
 */
export async function validateWebhook(payload) {
  // Para implementação completa: descriptografar JWE com chave privada RSA 2048,
  // depois validar JWS com chave pública Stone (recuperada via kid header).
  //
  // Implementação para DEMO: decodifica o payload JWS se presente, ou usa o body direto.
  try {
    if (typeof payload === 'string' && payload.includes('.')) {
      // É um token assinado/criptografado (header.payload.signature)
      const parts = payload.split('.');
      if (parts.length === 3 || parts.length === 5) {
        const decoded = Buffer.from(parts[1], 'base64url').toString();
        return JSON.parse(decoded);
      }
    }
    return typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch (err) {
    console.error('[Stone] Erro ao decodificar webhook:', err.message);
    throw new Error('Payload de webhook Stone inválido');
  }
}

// ── Normalização da resposta ─────────────────────────────────────────────────

function normalize(data) {
  const statusMap = {
    ATIVA: 'pending',
    CONCLUIDA: 'paid',
    REMOVIDA_PELO_USUARIO_RECEBEDOR: 'cancelled',
    REMOVIDA_PELO_PSP: 'cancelled',
    active: 'pending',
    concluded: 'paid',
  };
  return {
    provider: 'stone',
    chargeId: data.transaction_id || data.txid || data.id,
    status: statusMap[data.status] || 'pending',
    rawStatus: data.status,
    // Stone retorna qr_code_content (EMV) e qr_code_image (base64 ou URL)
    amount: data.amount ? data.amount / 100 : parseFloat(data.valor?.original || 0),
    pixCode: data.qr_code_content || data.pixCopiaECola || null,
    qrCodeBase64: data.qr_code_image || null,
    expiresAt: null,
    paidAt: data.updated_at || null,
    raw: data,
  };
}
