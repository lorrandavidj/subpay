// PayZap — Rotas de saldo e saques
// Consulta saldo disponível e solicita saques via Pix

import { Router } from 'express';
import { activeProvider } from '../providers/index.js';
import { efipayRawRequest } from '../providers/efipay.js';
import { cfg } from '../config.js';

const router = Router();

// ── GET /api/balance ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let balance = null;

    if (activeProvider === 'efipay') {
      // EfiPay: GET /v2/gn/saldo (scope: gn.balance.read)
      const data = await efipayRawRequest('get', '/v2/gn/saldo');
      balance = {
        available: parseFloat(data.disponivel),
        blocked:   parseFloat(data.bloqueado || 0),
        raw: data,
      };
    } else {
      // Mercado Pago e Stone: saldo não disponível via API de cobranças
      // Integração com contas requer escopo adicional (mp: users/me)
      balance = { available: null, message: 'Saldo não disponível para este provedor via API de cobranças.' };
    }

    res.json({ ok: true, provider: activeProvider, balance });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao consultar saldo', detail: err.message });
  }
});

// ── POST /api/balance/withdraw ────────────────────────────────────────────────
// Solicita saque via Pix
// Body: { amount: number, pixKey: string, pixKeyType: 'cpf'|'email'|'phone'|'random' }
router.post('/withdraw', async (req, res) => {
  try {
    const { amount, pixKey, pixKeyType = 'cpf' } = req.body;

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valor inválido' });
    if (!pixKey)                return res.status(400).json({ error: 'Chave Pix obrigatória' });

    // EfiPay: POST /v2/gn/pix/enviar (scope: pix.send)
    // Mercado Pago: não suporta saques via API de pagamentos
    // Stone: POST /api/v1/transfers (transferência entre contas)

    if (activeProvider === 'efipay') {
      const data = await efipayRawRequest('post', '/v2/gn/pix/enviar', {
        valor: amount.toFixed(2),
        chave: pixKey,
      });
      return res.json({ ok: true, withdraw: { id: data.idEnvio, status: data.status } });
    }

    // Outros provedores: retorna instrução manual por enquanto
    res.json({
      ok: true,
      withdraw: {
        status: 'pending_manual',
        message: `Saque de R$ ${amount.toFixed(2)} para ${pixKey} registrado. Processamento manual necessário para o provedor ${activeProvider}.`,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao processar saque', detail: err.message });
  }
});

export default router;
