// PayZap — Configuração central de provedores
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

export const PROVIDER = process.env.PAYMENT_PROVIDER || 'efipay';

export const cfg = {
  port: parseInt(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',

  efipay: {
    clientId:     process.env.EFIPAY_CLIENT_ID,
    clientSecret: process.env.EFIPAY_CLIENT_SECRET,
    pixKey:       process.env.EFIPAY_PIX_KEY,
    certPath:     process.env.EFIPAY_CERT_PATH || './certs/efipay-homolog.p12',
    certPass:      process.env.EFIPAY_CERT_PASS || '',
    sandbox:      process.env.EFIPAY_ENV !== 'production',
    baseUrl() {
      return this.sandbox
        ? 'https://pix-h.api.efipay.com.br'
        : 'https://pix.api.efipay.com.br';
    },
    tokenUrl() { return this.baseUrl() + '/oauth/token'; },
  },

  mercadopago: {
    accessToken:   process.env.MP_ACCESS_TOKEN,
    webhookSecret: process.env.MP_WEBHOOK_SECRET,
    sandbox:       process.env.MP_ENV !== 'production',
    baseUrl:       'https://api.mercadopago.com',
  },

  stone: {
    clientId:       process.env.STONE_CLIENT_ID,
    accountId:      process.env.STONE_ACCOUNT_ID,
    privateKeyPath: process.env.STONE_PRIVATE_KEY_PATH || './certs/stone-private.pem',
    pixKey:         process.env.STONE_PIX_KEY,
    sandbox:        process.env.STONE_ENV !== 'production',
    baseUrl() {
      return this.sandbox
        ? 'https://sandbox-api.openbank.stone.com.br'
        : 'https://api.openbank.stone.com.br';
    },
    authUrl() {
      return this.sandbox
        ? 'https://sandbox-accounts.openbank.stone.com.br/auth/realms/stone_bank/protocol/openid-connect/token'
        : 'https://accounts.openbank.stone.com.br/auth/realms/stone_bank/protocol/openid-connect/token';
    },
  },
};
