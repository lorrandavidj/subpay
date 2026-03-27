import * as efipay from '../providers/efipay.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testCreateCharge() {
  console.log('--- Testando EfiPay: Criar Cobrança ---');
  try {
    const charge = await efipay.createCharge({
      amount: 10.0,
      name: 'Cliente Teste',
      cpf: '12345678909',
      description: 'Teste de Integração PayZap',
      expiresIn: 3600
    });
    console.log('Sucesso!', JSON.stringify(charge, null, 2));
    return charge;
  } catch (err) {
    console.error('Erro:', err.message);
    if (err.detail) console.error('Detalhes:', JSON.stringify(err.detail, null, 2));
  }
}

// Executar teste se não houver credenciais, apenas mostrará o erro formatado
testCreateCharge();
