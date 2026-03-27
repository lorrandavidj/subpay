// PayZap — Rotas de webhooks (callbacks dos provedores)
import { Router } from 'express';
import { getCharge, activeProvider } from '../providers/index.js';
import * as efipay from '../providers/efipay.js';
import * as mp from '../providers/mercadopago.js';
import * as stone from '../providers/stone.js';

const router = Router();

// ── Armazenamento em memória (substituir por banco em produção) ──────────────
// Map: chargeId → status
export const chargeStatusCache = new Map();

// ── POST /webhook/efipay ──────────────────────────────────────────────────────
// EfiPay envia via mTLS — a validação é feita pelo servidor web (nginx/caddy).
// Este endpoint processa o payload.
router.post('/efipay', (req, res) => {
  try {
    const pixList = efipay.validateWebhook(req.body);

    pixList.forEach(pix => {
      console.log('[webhook/efipay] Pix recebido:', {
        txid:   pix.txid,
        valor:  pix.valor,
        e2eId:  pix.endToEndId,
        horario: pix.horario,
      });
      // Atualiza cache de status
      if (pix.txid) {
        chargeStatusCache.set(pix.txid, {
          status: 'paid',
          paidAt: pix.horario,
          e2eId:  pix.endToEndId,
          amount: parseFloat(pix.valor),
          pagador: pix.gnExtras?.pagador,
        });
      }
      // TODO: persistir no banco, disparar fulfillment, notificar vendedor etc.
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook/efipay] erro:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ── POST /webhook/mercadopago ─────────────────────────────────────────────────
// MP envia um evento leve; buscamos o pagamento completo via API.
router.post('/mercadopago', async (req, res) => {
  try {
    // req.rawBody é salvo pelo middleware em index.js antes do express.json()
    // Usar o body raw é obrigatório para validação HMAC correta
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const xSig    = req.headers['x-signature'] || '';
    const xReqId  = req.headers['x-request-id'] || '';
 
    const event = mp.validateWebhook(rawBody, xSig, xReqId);

    if (event.type === 'payment' && event.action === 'payment.updated') {
      const paymentId = event.data?.id;
      console.log('[webhook/mercadopago] payment.updated:', paymentId);

      const charge = await mp.getCharge(String(paymentId));

      chargeStatusCache.set(String(paymentId), {
        status: charge.status,
        paidAt: charge.paidAt,
        amount: charge.amount,
      });
      // TODO: persistir no banco
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook/mercadopago] erro:', err.message);
    // MP exige 200 ou reenviar — respondemos 200 mesmo com erros internos
    res.sendStatus(200);
  }
});

// ── POST /webhook/stone ───────────────────────────────────────────────────────
// Stone envia JWE (payload criptografado). Requer descriptografia completa.
router.post('/stone', async (req, res) => {
  try {
    const jweToken = req.body?.signed_payload || JSON.stringify(req.body);
    const event = await stone.validateWebhook(jweToken);

    console.log('[webhook/stone] evento:', event?.event_type, event?.resource_id);

    if (['transaction_approved', 'transaction_created'].includes(event?.event_type)) {
      const txId = event.resource?.transaction_id;
      if (txId) {
        chargeStatusCache.set(txId, {
          status: event.event_type === 'transaction_approved' ? 'paid' : 'pending',
          paidAt: event.resource?.updated_at,
        });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook/stone] erro:', err.message);
    res.sendStatus(200);
  }
});

// ── GET /webhook/status/:chargeId ─────────────────────────────────────────────
// Frontend faz polling neste endpoint para saber se o pagamento foi confirmado.
// Retorna do cache (webhook) ou consulta o provedor em tempo real.
router.get('/status/:chargeId', async (req, res) => {
  const { chargeId } = req.params;

  // 1. Verifica cache de webhooks recebidos
  const cached = chargeStatusCache.get(chargeId);
  if (cached) {
    return res.json({ ok: true, source: 'webhook', ...cached });
  }

  // 2. Fallback: consulta o provedor em tempo real
  try {
    const charge = await getCharge(chargeId);
    return res.json({ ok: true, source: 'poll', ...charge });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao consultar status', detail: err.message });
  }
});

export default router;
