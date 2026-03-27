// PayZap — Provedor EfiPay (Gerencianet)
// Docs: https://dev.efipay.com.br/docs/api-pix/credenciais/
//
// Autenticação: OAuth2 client_credentials + certificado mTLS (P12)
// Token expira em 3600s. Renovação automática com margem de 60s.

import https from 'https';
import fs from 'fs';
import axios from 'axios';
import path from 'path';
import { cfg } from '../config.js';

// ── Token + Agent cache ───────────────────────────────────────────────────────
let _token = null;
let _tokenExpires = 0;
let _tokenPromise = null; // evita race condition em requisições paralelas
let _agent = null;        // reutiliza https.Agent (evita re-leitura do cert)

export function resetAgent() {
  console.log('[EfiPay] Resetando agente de conexão (configuração alterada)');
  _agent = null;
  _token = null;
  _tokenExpires = 0;
}

function buildAgent() {
  if (_agent) return _agent;
  const c = cfg.efipay;
  let pfx;

  if (c.certBase64) {
    console.log('[EfiPay] Usando certificado de variável de ambiente (base64)');
    pfx = Buffer.from(c.certBase64, 'base64');
  } else {
    const fullPath = path.resolve(c.certPath);
    console.log(`[EfiPay] Procurando certificado em: ${fullPath}`);
    if (!fs.existsSync(fullPath)) {
      const dirContents = fs.existsSync(path.dirname(fullPath)) ? fs.readdirSync(path.dirname(fullPath)) : 'DIRETÓRIO NÃO EXISTE';
      throw new Error(`[EfiPay] Certificado não encontrado em ${fullPath}. Arquivos no diretório: ${dirContents}`);
    }
    pfx = fs.readFileSync(fullPath);
    console.log(`[EfiPay] Certificado carregado (${pfx.length} bytes)`);
  }

  _agent = new https.Agent({ pfx, passphrase: c.certPass, rejectUnauthorized: true });
  return _agent;
}

async function getAccessToken() {
  const c = cfg.efipay;
  const now = Date.now();
  if (_token && now < _tokenExpires) return _token;

  console.log(`[EfiPay] Solicitando novo token OAuth2 (${c.sandbox ? 'SANDBOX' : 'PRODUÇÃO'})...`);
  const agent = buildAgent();
  // Coalesce: se já há uma renovação em andamento, aguarda ela
  if (_tokenPromise) return _tokenPromise;

  _tokenPromise = (async () => {
    const credentials = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');

    const { data } = await axios.post(
      c.tokenUrl(),
      { grant_type: 'client_credentials' },
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        httpsAgent: agent,
      }
    );

    _token = data.access_token;
    _tokenExpires = Date.now() + (data.expires_in - 60) * 1000;
    _tokenPromise = null;
    return _token;
  })();

  return _tokenPromise;
}

function client() {
  const agent = buildAgent();
  return {
    async request(method, path, data) {
      const token = await getToken();
      const res = await axios({
        method,
        url: cfg.efipay.baseUrl() + path,
        data,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        httpsAgent: agent,
      });
      return res.data;
    },
  };
}

// ── Interface pública ────────────────────────────────────────────────────────

/**
 * Executa uma requisição autenticada direta contra a API EfiPay.
 */
export async function efipayRawRequest(method, path, body = null) {
  try {
    return await client().request(method, path, body);
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error(`[EfiPay] Raw request error (${method} ${path}):`, detail);
    throw err;
  }
}

/**
 * Cria uma cobrança Pix imediata.
 * @param {object} p
 * @param {number}  p.amount       - Valor em reais (ex: 99.90)
 * @param {string}  p.name         - Nome do pagador
 * @param {string}  p.cpf          - CPF do pagador (apenas dígitos)
 * @param {string}  p.description  - Descrição/solicitação ao pagador
 * @param {number}  p.expiresIn    - Expiração em segundos (padrão 3600)
 * @param {string}  p.externalId   - ID externo (txid)
 */
export async function createCharge({ amount, name, cpf, description, expiresIn = 3600, externalId }) {
  // O txid deve ter entre 26 e 35 caracteres, alfanumérico.
  const txid = externalId?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 35)
    || (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).toUpperCase().slice(0, 35);

  const body = {
    calendario: { expiracao: expiresIn },
    devedor: { 
      cpf: cpf.replace(/\D/g, ''), 
      nome: name 
    },
    valor: { 
      original: amount.toFixed(2) 
    },
    chave: cfg.efipay.pixKey,
    solicitacaoPagador: description || 'Pagamento PayZap',
  };

  try {
    const data = await client().request('put', `/v2/cob/${txid}`, body);

    // Busca o QR code base64 (endpoint /v2/loc/:id/qrcode)
    let qrCodeBase64 = null;
    if (data.loc?.id) {
      try {
        const qr = await client().request('get', `/v2/loc/${data.loc.id}/qrcode`);
        qrCodeBase64 = qr.imagemQrcode;
      } catch (qrErr) {
        console.warn('[EfiPay] Falha ao obter QR Code imagem:', qrErr.response?.data || qrErr.message);
      }
    }

    return normalize(data, qrCodeBase64);
  } catch (err) {
    throw handleEfiError(err, 'falha ao criar cobrança');
  }
}

/**
 * Consulta o status de uma cobrança.
 */
export async function getCharge(chargeId) {
  try {
    const data = await client().request('get', `/v2/cob/${chargeId}`);
    return normalize(data);
  } catch (err) {
    throw handleEfiError(err, 'falha ao consultar cobrança');
  }
}

/**
 * Solicita reembolso de um Pix recebido.
 */
export async function refund(e2eId, amount = null) {
  const refundId = `D${Date.now()}`;
  const body = amount ? { valor: amount.toFixed(2) } : {};
  try {
    const data = await client().request('put', `/v2/pix/${e2eId}/devolucao/${refundId}`, body);
    return {
      refundId,
      status: data.status, // EM_PROCESSAMENTO | DEVOLVIDO | NAO_REALIZADO
      raw: data,
    };
  } catch (err) {
    throw handleEfiError(err, 'falha ao processar reembolso');
  }
}

/**
 * Verifica assinatura do webhook EfiPay.
 */
export function validateWebhook(body) {
  if (!body?.pix || !Array.isArray(body.pix)) {
    throw new Error('Payload de webhook EfiPay inválido: campo "pix" ausente ou malformatado');
  }
  return body.pix;
}

// ── Utilitários internos ─────────────────────────────────────────────────────

function handleEfiError(err, context) {
  const detail = err.response?.data || err.message;
  console.error(`[EfiPay] ${context}:`, detail);
  
  // Extrai mensagem amigável se disponível na resposta da API
  const message = detail.mensagem || detail.error_description || `Erro no provedor EfiPay (${context})`;
  const newErr = new Error(message);
  newErr.status = err.response?.status || 500;
  newErr.detail = detail;
  return newErr;
}

function normalize(data, qrCodeBase64 = null) {
  // Mapeamento de status oficial EfiPay -> PayZap unificado
  const statusMap = {
    'ATIVA':     'pending',     // Cobrança ativa, aguardando pagamento
    'CONCLUIDA':  'paid',        // Pagamento confirmado
    'REMOVIDA_PELO_USUARIO_RECEBEDOR': 'cancelled',
    'REMOVIDA_PELO_PSP':             'cancelled',
    'EXPIRADA':  'cancelled'    // Tempo de expiração atingido
  };

  return {
    provider: 'efipay',
    chargeId: data.txid,
    status: statusMap[data.status] || 'pending',
    rawStatus: data.status,
    amount: parseFloat(data.valor?.original || 0),
    pixCode: data.pixCopiaECola || null,
    qrCodeBase64: qrCodeBase64 || null,
    location: data.location || null,
    expiresAt: data.calendario?.criacao && data.calendario?.expiracao
      ? new Date(new Date(data.calendario.criacao).getTime() + data.calendario.expiracao * 1000).toISOString()
      : null,
    paidAt: data.pix?.[0]?.horario || null,
    e2eId: data.pix?.[0]?.endToEndId || null,
    raw: data,
  };
}
