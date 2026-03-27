// PayZap — Rotas de cobranças
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createCharge, getCharge, refund, activeProvider } from '../providers/index.js';

const router = Router();

// ── POST /api/charges ─────────────────────────────────────────────────────────
// Cria uma nova cobrança Pix
//
// Body:
// {
//   amount:      number   (R$, ex: 99.90)
//   name:        string   (nome do pagador)
//   cpf:         string   (CPF do pagador)
//   email:       string   (e-mail — obrigatório no Mercado Pago)
//   description: string   (descrição)
//   externalId:  string   (id do seu sistema, opcional)
//   expiresIn:   number   (segundos, padrão 3600)
// }
router.post('/', async (req, res) => {
  try {
    const { amount, name, cpf, email, description, externalId, expiresIn } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount inválido' });
    }
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    if (!cpf)  return res.status(400).json({ error: 'cpf é obrigatório' });

    const charge = await createCharge({
      amount: parseFloat(amount),
      name,
      cpf,
      email,
      description,
      externalId: externalId || uuidv4(),
      expiresIn: expiresIn || 3600,
    });

    res.status(201).json({
      ok: true,
      provider: activeProvider,
      charge,
    });
  } catch (err) {
    console.error('[charges] createCharge error:', err?.response?.data || err.message);
    res.status(500).json({
      error: 'Falha ao criar cobrança',
      detail: err?.response?.data || err.message,
    });
  }
});

// ── GET /api/charges/:id ──────────────────────────────────────────────────────
// Consulta o status de uma cobrança
router.get('/:id', async (req, res) => {
  try {
    const charge = await getCharge(req.params.id);
    res.json({ ok: true, charge });
  } catch (err) {
    const status = err?.response?.status === 404 ? 404 : 500;
    res.status(status).json({
      error: status === 404 ? 'Cobrança não encontrada' : 'Falha ao consultar cobrança',
      detail: err?.response?.data || err.message,
    });
  }
});

// ── POST /api/charges/:id/refund ─────────────────────────────────────────────
// Solicita reembolso
// Body: { amount: number | null } (null = reembolso total)
router.post('/:id/refund', async (req, res) => {
  try {
    const { amount } = req.body;
    const result = await refund(req.params.id, amount ? parseFloat(amount) : null);
    res.json({ ok: true, refund: result });
  } catch (err) {
    console.error('[charges] refund error:', err?.response?.data || err.message);
    res.status(500).json({
      error: 'Falha ao processar reembolso',
      detail: err?.response?.data || err.message,
    });
  }
});

export default router;
