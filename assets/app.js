/* PayZap — Shared Logic */

/* ── THEME ── */
const Theme = {
  ICON_DARK:  `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  ICON_LIGHT: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,

  get() { return localStorage.getItem('pz_theme') || 'dark'; },

  apply(t) {
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '');
    localStorage.setItem('pz_theme', t);
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.innerHTML = t === 'dark' ? Theme.ICON_LIGHT : Theme.ICON_DARK;
      btn.title = t === 'dark' ? 'Tema claro' : 'Tema escuro';
    });
    // Re-render charts with new theme colors
    if (typeof Chart !== 'undefined' && typeof initCharts === 'function') {
      [...Object.values(Chart.instances)].forEach(c => c.destroy());
      initCharts();
    }
  },

  toggle() { Theme.apply(Theme.get() === 'dark' ? 'light' : 'dark'); },

  init() { Theme.apply(Theme.get()); }
};

const USERS = [
  { email: 'admin@payzap.com',   senha: 'admin123', role: 'superadmin', nome: 'Carlos Mendes' },
  { email: 'maria@empresa.com',  senha: '123456',   role: 'vendedor',   nome: 'Maria Silva' }
];

/* ── SESSION ── */
const Session = {
  set(user)  { localStorage.setItem('pz_user', JSON.stringify(user)); },
  get()      { try { return JSON.parse(localStorage.getItem('pz_user')); } catch { return null; } },
  clear()    { localStorage.removeItem('pz_user'); },
  require(role) {
    const u = Session.get();
    if (!u) { window.location.href = 'index.html'; return null; }
    if (role && u.role !== role) { window.location.href = 'index.html'; return null; }
    return u;
  }
};

function login(email, senha) {
  const user = USERS.find(u => u.email === email && u.senha === senha);
  if (!user) return null;
  Session.set(user);
  return user;
}

function logout() {
  Session.clear();
  window.location.href = 'index.html';
}

/* ── FORMAT ── */
function fmt(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function fmtCompact(value) {
  if (value >= 1e9) return 'R$ ' + (value / 1e9).toFixed(1) + 'B';
  if (value >= 1e6) return 'R$ ' + (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return 'R$ ' + (value / 1e3).toFixed(0) + 'k';
  return fmt(value);
}

function fmtNum(n) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

function fmtDate(dateStr, short = false) {
  if (!dateStr) return '—';
  // Date-only strings (YYYY-MM-DD) are parsed as UTC → append time to use local timezone
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr)) ? dateStr + 'T12:00:00' : dateStr;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '—';
  const opts = short
    ? { day: '2-digit', month: '2-digit', year: 'numeric' }
    : { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  return new Intl.DateTimeFormat('pt-BR', opts).format(d);
}

function fmtCPF(cpf) {
  return cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function fmtCNPJ(cnpj) {
  return cnpj.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

/* ── TOAST ── */
function showToast(msg, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const colors = { success: 'var(--green)', error: 'var(--red)', warning: 'var(--yellow)', info: 'var(--blue)' };
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span class="toast-icon" style="color:${colors[type]}">${icons[type]}</span>
    <span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 260);
  }, 3500);
}

/* ── CLIPBOARD ── */
function copyToClipboard(text, label = 'Copiado!') {
  navigator.clipboard.writeText(text).then(() => showToast(label, 'success')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(label, 'success');
  });
}

/* ── MODAL / DRAWER ── */
let _overlayCount = 0;

function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); _overlayCount++; document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); _overlayCount = Math.max(0, _overlayCount - 1); if (_overlayCount === 0) document.body.style.overflow = ''; }
}
function openDrawer(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); _overlayCount++; document.body.style.overflow = 'hidden'; }
}
function closeDrawer(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); _overlayCount = Math.max(0, _overlayCount - 1); if (_overlayCount === 0) document.body.style.overflow = ''; }
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
  if (e.target.classList.contains('drawer-overlay')) closeDrawer(e.target.id);
});

/* ── CSV EXPORT ── */
function downloadCSV(rows, filename = 'export.csv') {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/* ── INPUT MASKS ── */
function maskCPF(input) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '').slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    input.value = v;
  });
}

function maskCNPJ(input) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '').slice(0, 14);
    v = v.replace(/(\d{2})(\d)/, '$1.$2')
         .replace(/(\d{3})(\d)/, '$1.$2')
         .replace(/(\d{3})(\d)/, '$1/$2')
         .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    input.value = v;
  });
}

/* ── HTML ESCAPE ── */
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── UTILS ── */
function randomId(prefix = 'TXN') {
  return prefix + Math.random().toString(36).slice(2, 10).toUpperCase();
}

function animateCounter(el, duration = 1800) {
  const target = parseFloat(el.dataset.count);
  const prefix = el.dataset.prefix || '';
  const suffix = el.dataset.suffix || '';
  const decimal = target % 1 !== 0;
  const start = performance.now();
  const tick = now => {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const val = target * ease;
    el.textContent = prefix + (decimal ? val.toFixed(1) : Math.floor(val)) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ── MOCK DATA GENERATORS ── */
const NOMES = ['Ana Costa','Bruno Lima','Carlos Souza','Daniela Ferreira','Eduardo Alves',
  'Fernanda Santos','Gabriel Oliveira','Helena Ramos','Igor Mendes','Juliana Pereira',
  'Kevin Araújo','Laura Ribeiro','Mateus Gomes','Natalia Vieira','Oscar Carvalho',
  'Patrícia Nunes','Queila Martins','Rafael Torres','Sabrina Castro','Thiago Rodrigues'];

const STATUS_TXN = ['pago','pago','pago','pago','expirado','cancelado','aguardando'];

function randomTxn(i = 0) {
  const valor = Math.round((Math.random() * 2000 + 30) * 100) / 100;
  const status = STATUS_TXN[Math.floor(Math.random() * STATUS_TXN.length)];
  const d = new Date(Date.now() - i * 3600000 * 4 - Math.random() * 7200000);
  const nome = NOMES[Math.floor(Math.random() * NOMES.length)];
  const cpf = String(Math.random()).slice(2, 13).padStart(11, '0');
  return {
    id: randomId('TXN'),
    nome,
    cpf: fmtCPF(cpf),
    valor,
    status,
    data: d.toISOString(),
    email: nome.toLowerCase().replace(/ /g, '.') + '@gmail.com',
    descricao: ['Produto Digital', 'Assinatura Mensal', 'Curso Online', 'Consultoria', 'Licença Software'][i % 5]
  };
}

function generateTxns(count = 20) {
  return Array.from({ length: count }, (_, i) => randomTxn(i));
}
