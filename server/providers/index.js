// PayZap — Factory de provedores
// Seleciona o provedor ativo via PAYMENT_PROVIDER no .env

import { PROVIDER } from '../config.js';
import * as efipay      from './efipay.js';
import * as mercadopago from './mercadopago.js';
import * as stone       from './stone.js';

const providers = { efipay, mercadopago, stone };

function getProvider() {
  const p = providers[PROVIDER];
  if (!p) throw new Error(`Provedor desconhecido: "${PROVIDER}". Use: efipay | mercadopago | stone`);
  return p;
}

// Interface unificada — todas as rotas usam estas funções
export const createCharge   = (params) => getProvider().createCharge(params);
export const getCharge      = (id)     => getProvider().getCharge(id);
export const refund         = (id, amt) => getProvider().refund(id, amt);
export const validateWebhook = (...args) => getProvider().validateWebhook(...args);
export const activeProvider  = PROVIDER;
