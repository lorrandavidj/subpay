// PayZap — Rotas de webhooks (callbacks dos provedores)
import { Router } from 'express';
import { getCharge, activeProvider, validateWebhook } from '../providers/index.js';
import { db } from '../db.js';
import * as efipay from '../providers/efipay.js';
import * as mp from '../providers/mercadopago.js';
import * as stone from '../providers/stone.js';

const router = Router();

// ── Armazenamento em memória (substituir por banco em produção) ──────────────
// Map: chargeId → status
export const chargeStatusCache = new Map();

// EfiPay envia via mTLS (padrão Banco Central).
// A Efi adiciona automaticamente '/pix' ao final da URL de webhook, a menos que se use o parâmetro ?ignorar=
// Aceitamos ambos os caminhos para maior compatibilidade.
const processEfiWebhook = async (req, res) => {
  try {
    const pixList = efipay.validateWebhook(req.body);

    for (const pix of pixList) {
      console.log('[webhook/efipay] Pix recebido:', {
        txid:   pix.txid,
        valor:  pix.valor,
        e2eId:  pix.endToEndId,
      });

      if (pix.txid) {
        // Atualiza cache/persiste
        await db.saveTransaction({
          id: pix.txid,
          status: 'pago',
          pagamento_em: pix.horario || new Date().toISOString(),
          detalhes: JSON.stringify({ e2eId: pix.endToEndId, valor: pix.valor })
        });
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook/efipay] erro:', err.message);
    res.status(400).send('Bad Request');
  }
};

router.post('/efipay', processEfiWebhook);
router.post('/efipay/pix', processEfiWebhook);

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

        // Persistir no banco
        if (event.event_type === 'transaction_approved') {
          console.log('[webhook] Stone confirmed:', txId);
          await db.saveTransaction({
            id: txId,
            status: 'pago',
            pagamento_em: event.resource?.updated_at || new Date().toISOString(),
          });
        }
      }
    }

    res.status(200).send('OK');
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
