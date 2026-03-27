// PayZap — Middleware de autenticação para a API interna
// Valida o JWT enviado pelo painel admin/superadmin
// Header esperado: Authorization: Bearer <jwt>

import { cfg } from '../config.js';
import crypto from 'crypto';

/**
 * Middleware simples de autenticação via HMAC-SHA256.
 * Em produção, use uma biblioteca JWT completa (jose, jsonwebtoken).
 */
export function requireApiKey(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Token não informado' });
  }

  // Verifica se é o token interno do painel
  const expected = crypto
    .createHmac('sha256', cfg.jwtSecret)
    .update('payzap-internal')
    .digest('hex');

  if (token !== expected) {
    return res.status(403).json({ error: 'Token inválido' });
  }

  next();
}

/**
 * Gera o token de API para uso no frontend.
 * Chamado pelo painel ao fazer login.
 */
export function generateApiToken() {
  return crypto
    .createHmac('sha256', cfg.jwtSecret)
    .update('payzap-internal')
    .digest('hex');
}
