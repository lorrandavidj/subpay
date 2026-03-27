import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

// Inicializa diretório se não existir
async function init() {
  try { await fs.access(DATA_DIR); }
  catch { await fs.mkdir(DATA_DIR, { recursive: true }); }
}

async function read(file) {
  await init();
  const filePath = path.join(DATA_DIR, file + '.json');
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function write(file, data) {
  await init();
  const filePath = path.join(DATA_DIR, file + '.json');
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export const db = {
  // TRANSACTIONS
  async getTransactions() { return await read('transactions'); },
  async saveTransaction(txn) {
    const txns = await read('transactions');
    const idx = txns.findIndex(t => t.id === txn.id);
    if (idx >= 0) txns[idx] = { ...txns[idx], ...txn };
    else txns.unshift(txn);
    await write('transactions', txns);
  },

  // PRODUCTS
  async getProducts() { return await read('products'); },
  async saveProduct(prod) {
    const prods = await read('products');
    const idx = prods.findIndex(p => p.id === prod.id);
    if (idx >= 0) prods[idx] = { ...prods[idx], ...prod };
    else prods.unshift(prod);
    await write('products', prods);
  },
  async deleteProduct(id) {
    const prods = await read('products');
    const filtered = prods.filter(p => p.id !== id);
    await write('products', filtered);
  }
};
