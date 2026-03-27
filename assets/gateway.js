/* PayZap — Gateway Client (frontend → backend)
 * Abstrai qual provedor está ativo. O frontend nunca fala direto com EfiPay/MP/Stone.
 * Todas as chamadas passam por /api/* no servidor Node.js.
 */

const Gateway = (() => {

  // URL base do servidor. Em produção, aponte para o domínio real.
  const BASE = window.PAYZAP_API_URL || window.location.origin;

  // Token de autenticação para rotas protegidas (carregado após login)
  let _apiToken = localStorage.getItem('pz_api_token') || null;

  function headers(auth = false) {
    const h = { 'Content-Type': 'application/json' };
    if (auth && _apiToken) h['Authorization'] = `Bearer ${_apiToken}`;
    return h;
  }

  async function request(method, path, body = null, auth = false) {
    const opts = {
      method,
      headers: headers(auth),
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(BASE + path, opts);
    const data = await res.json();

    if (!res.ok) {
      const err = new Error(data.error || `Erro ${res.status}`);
      err.detail = data.detail;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {

    // ── Auth ────────────────────────────────────────────────────────────────

    async login(email, password) {
      const data = await request('POST', '/auth/token', { email, password });
      _apiToken = data.token;
      localStorage.setItem('pz_api_token', _apiToken);
      return data;
    },

    logout() {
      _apiToken = null;
      localStorage.removeItem('pz_api_token');
    },

    // ── Cobranças ───────────────────────────────────────────────────────────

    /**
     * Cria uma cobrança Pix.
     * @param {object} p
     * @param {number}  p.amount      - Valor em reais (ex: 99.90)
     * @param {string}  p.name        - Nome do pagador
     * @param {string}  p.cpf         - CPF (apenas dígitos ou formatado)
     * @param {string}  p.email       - E-mail do pagador
     * @param {string}  p.description - Descrição
     * @param {string}  p.externalId  - ID externo (opcional)
     * @param {number}  p.expiresIn   - Expiração em segundos (padrão 3600)
     * @returns {{ charge: ChargeResult }}
     *
     * ChargeResult: {
     *   provider, chargeId, status, amount,
     *   pixCode,       ← string EMV (copia-e-cola)
     *   qrCodeBase64,  ← imagem base64 para exibir
     *   expiresAt,     ← ISO string
     * }
     */
    async createCharge(p) {
      return request('POST', '/api/charges', p);
    },

    /**
     * Consulta o status de uma cobrança.
     * status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'chargedback'
     */
    async getChargeStatus(chargeId) {
      return request('GET', `/webhook/status/${chargeId}`);
    },

    /**
     * Polling automático até pagamento ou timeout.
     * @param {string}   chargeId     - ID da cobrança
     * @param {Function} onUpdate     - callback(charge) a cada checagem
     * @param {object}   opts
     * @param {number}   opts.interval  - Intervalo em ms (padrão 3000)
     * @param {number}   opts.timeout   - Timeout em ms (padrão 1800000 = 30min)
     * @returns {Promise<ChargeResult>} - Resolve quando pago ou rejeita no timeout
     */
    pollCharge(chargeId, onUpdate, { interval = 3000, timeout = 1800000 } = {}) {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        let timer;

        const check = async () => {
          try {
            const { charge } = await this.getChargeStatus(chargeId);
            if (typeof onUpdate === 'function') onUpdate(charge);

            if (charge.status === 'paid') {
              clearInterval(timer);
              return resolve(charge);
            }
            if (['cancelled', 'refunded', 'chargedback'].includes(charge.status)) {
              clearInterval(timer);
              return reject(new Error(`Cobrança ${charge.status}`));
            }
            if (Date.now() - start >= timeout) {
              clearInterval(timer);
              return reject(new Error('Timeout: pagamento não confirmado'));
            }
          } catch (err) {
            // Erros de rede: não cancela o polling, apenas loga
            console.warn('[Gateway] pollCharge erro:', err.message);
          }
        };

        check();
        timer = setInterval(check, interval);
      });
    },

    /**
     * Solicita reembolso de uma cobrança.
     * @param {string} chargeId - ID da cobrança
     * @param {number} amount   - Valor a reembolsar (null = total)
     */
    async refund(chargeId, amount = null) {
      return request('POST', `/api/charges/${chargeId}/refund`, { amount }, true);
    },

    // ── Saldo ───────────────────────────────────────────────────────────────

    async getBalance() {
      return request('GET', '/api/balance', null, true);
    },

    async requestWithdraw(amount, pixKey, pixKeyType = 'cpf') {
      return request('POST', '/api/balance/withdraw', { amount, pixKey, pixKeyType }, true);
    },

    // ── Health ──────────────────────────────────────────────────────────────

    async health() {
      return request('GET', '/health');
    },
  };
})();

// Disponível globalmente
window.Gateway = Gateway;
