import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as efipay from '../providers/efipay.js';
import { reloadConfig } from '../config.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env');

// Mapeamento dos campos do formulário para as variáveis do .env
const ENV_MAP = {
  // EfiPay
  'sa-efi-client-id':     'EFIPAY_CLIENT_ID',
  'sa-efi-client-secret': 'EFIPAY_CLIENT_SECRET',
  'sa-efi-pix-key':       'EFIPAY_PIX_KEY',
  'sa-efi-cert-path':     'EFIPAY_CERT_PATH',
  'sa-efi-cert-pass':     'EFIPAY_CERT_PASS',
  'sa-efi-env':           'EFIPAY_ENV',
  
  // Mercado Pago
  'sa-mp-access-token':   'MP_ACCESS_TOKEN',
  'sa-mp-webhook-secret': 'MP_WEBHOOK_SECRET',
  'sa-mp-env':           'MP_ENV',

  // Stone
  'sa-stone-client-id':   'STONE_CLIENT_ID',
  'sa-stone-account-id':  'STONE_ACCOUNT_ID',
  'sa-stone-pix-key':     'STONE_PIX_KEY',
  'sa-stone-key-path':    'STONE_PRIVATE_KEY_PATH',
  'sa-stone-env':         'STONE_ENV',

  // Provedor ativo
  'sa-active-provider':   'PAYMENT_PROVIDER'
};

router.get('/', async (req, res) => {
  try {
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (err) {
      return res.json({ ok: true, config: {} });
    }

    const config = {};
    const lines = envContent.split('\n');
    
    // Inverte o mapeamento para facilitar a busca
    const REVERSE_MAP = {};
    for (const [formId, envKey] of Object.entries(ENV_MAP)) {
      REVERSE_MAP[envKey] = formId;
    }

    for (const line of lines) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=');
      const formId = REVERSE_MAP[key];
      if (formId) {
        config[formId] = value.trim();
      }
    }

    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Erro ao carregar configuração: ' + err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const updates = req.body;
    let envContent = '';
    
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (err) {
      // Se não existir, começa vazio
    }

    let lines = envContent.split('\n');
    
    for (const [formId, value] of Object.entries(updates)) {
      const envKey = ENV_MAP[formId];
      if (!envKey) continue;

      const newLine = `${envKey}=${value}`;
      const index = lines.findIndex(line => line.startsWith(`${envKey}=`));
      
      if (index !== -1) {
        lines[index] = newLine;
      } else {
        lines.push(newLine);
      }
    }

    await fs.writeFile(envPath, lines.join('\n'), 'utf8');
    
    // Recarrega o process.env e reseta o cache do provedor
    reloadConfig();
    efipay.resetAgent();
    
    console.log('[Config] .env atualizado com sucesso');
    res.json({ ok: true, message: 'Configuração salva com sucesso. Reinicie o servidor.' });
  } catch (err) {
    console.error('[Config] Erro ao salvar:', err);
    res.status(500).json({ ok: false, message: 'Erro ao salvar configuração: ' + err.message });
  }
});

router.post('/test-efipay', async (req, res) => {
  try {
    console.log('[Config/Test] Efetuando teste de conexão EfiPay...');
    const result = await efipay.getAccessToken(); // Força renovação/teste
    res.json({ ok: true, message: 'Sucesso: Token OAuth2 obtido com sucesso da Efi Pay.', detail: result });
  } catch (err) {
    console.error('[Config/Test] Falha no teste EfiPay:', err.message);
    res.status(500).json({ 
      ok: false, 
      message: 'Falha na conexão com Efi Pay: ' + err.message,
      detail: err.detail || 'Verifique se o Client ID, Secret e Certificado estão corretos.'
    });
  }
});

export default router;
