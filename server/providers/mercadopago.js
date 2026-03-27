// PayZap — Provedor Mercado Pago
// Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix
//
// Autenticação: Bearer Access Token
// Sandbox: token TEST-xxx, mesma URL de produção.

import axios from 'axios';
import crypto from 'crypto';
import { cfg } from '../config.js';

const BASE = cfg.mercadopago.baseUrl;

function headers(idempotencyKey = null) {
  const h = {
    Authorization: `Bearer ${cfg.mercadopago.accessToken}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) h['X-Idempotency-Key'] = idempotencyKey;
  return h;
}

// ── Interface pública ────────────────────────────────────────────────────────

/**
 * Cria uma cobrança Pix.
 * @param {object} p
 * @param {number}  p.amount       - Valor em reais
 * @param {string}  p.name         - Nome do pagador
 * @param {string}  p.cpf          - CPF do pagador
 * @param {string}  p.email        - E-mail do pagador (obrigatório no MP)
 * @param {string}  p.description  - Descrição do pagamento
 * @param {string}  p.externalId   - Referência externa
 * @param {string}  p.webhookUrl   - URL para notificações (opcional — usa PUBLIC_URL se omitido)
 * @returns {ChargeResult}
 */
export async function createCharge({ amount, name, cpf, email, description, externalId, webhookUrl }) {
  const idempotencyKey = externalId || crypto.randomUUID();
  const notifyUrl = webhookUrl || `${cfg.publicUrl}/webhook/mercadopago`;

  const body = {
    transaction_amount: amount,
    description: description || 'Pagamento PayZap',
    payment_method_id: 'pix',
    external_reference: externalId || idempotencyKey,
    notification_url: notifyUrl,
    payer: {
      email: email || 'comprador@payzap.com',
      first_name: name?.split(' ')[0] || 'Comprador',
      last_name: name?.split(' ').slice(1).join(' ') || '',
      identification: {
        type: 'CPF',
        number: cpf?.replace(/\D/g, '') || '',
      },
    },
  };

  const { data } = await axios.post(`${BASE}/v1/payments`, body, {
    headers: headers(idempotencyKey),
  });

  return normalize(data);
}

/**
 * Consulta o status de um pagamento.
 * @param {string} chargeId - ID numérico retornado em createCharge
 */
export async function getCharge(chargeId) {
  const { data } = await axios.get(`${BASE}/v1/payments/${chargeId}`, {
    headers: headers(),
  });
  return normalize(data);
}

/**
 * Reembolso total ou parcial.
 * @param {string} chargeId - ID do pagamento
 * @param {number} amount   - Valor a reembolsar (null = total)
 */
export async function refund(chargeId, amount = null) {
  const body = amount ? { amount } : {};
  const { data } = await axios.post(`${BASE}/v1/payments/${chargeId}/refunds`, body, {
    headers: headers(crypto.randomUUID()),
  });
  return {
    refundId: String(data.id),
    status: data.status,  // approved | pending | rejected
    raw: data,
  };
}

/**
 * Valida a assinatura HMAC do webhook Mercado Pago.
 * Header: x-signature = "ts=<timestamp>,v1=<hmac_sha256>"
 * @param {string} rawBody      - Body da requisição como string
 * @param {string} xSignature   - Valor do header x-signature
 * @param {string} xRequestId   - Valor do header x-request-id
 */
export function validateWebhook(rawBody, xSignature, xRequestId) {
  if (!cfg.mercadopago.webhookSecret) {
    console.warn('[MercadoPago] Webhook secret não configurado — pulando validação de assinatura');
    return JSON.parse(rawBody);
  }

  const parts = Object.fromEntries(
    xSignature.split(',').map(p => p.split('='))
  );
  const ts = parts.ts;
  const v1 = parts.v1;

  if (!ts || !v1) throw new Error('Header x-signature inválido');

  // Manifesto: "id:<data.id>;request-id:<xRequestId>;ts:<ts>;"
  const body = JSON.parse(rawBody);
  const manifest = `id:${body.data?.id};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', cfg.mercadopago.webhookSecret)
    .update(manifest)
    .digest('hex');

  if (expected !== v1) throw new Error('Assinatura de webhook inválida');
  return body;
}

// ── Normalização da resposta ─────────────────────────────────────────────────

function normalize(data) {
  const statusMap = {
    pending:      'pending',
    approved:     'paid',
    cancelled:    'cancelled',
    rejected:     'cancelled',
    refunded:     'refunded',
    charged_back: 'chargedback',
  };
  const txData = data.point_of_interaction?.transaction_data;
  return {
    provider: 'mercadopago',
    chargeId: String(data.id),
    status: statusMap[data.status] || data.status,
    rawStatus: data.status,
    statusDetail: data.status_detail,
    amount: data.transaction_amount,
    pixCode: txData?.qr_code || null,
    qrCodeBase64: txData?.qr_code_base64 || null,
    ticketUrl: txData?.ticket_url || null,
    externalReference: data.external_reference,
    expiresAt: data.date_of_expiration || null,
    paidAt: data.date_approved || null,
    raw: data,
  };
}
