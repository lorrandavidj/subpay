/* PayZap — Chart.js Helpers */

function getThemeColors() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    text:          isLight ? 'rgba(60,60,67,0.55)'    : '#8890a4',
    textMuted:     isLight ? 'rgba(60,60,67,0.40)'    : '#555d72',
    border:        isLight ? 'rgba(60,60,67,0.12)'    : 'rgba(255,255,255,0.06)',
    gridLine:      isLight ? 'rgba(60,60,67,0.07)'    : 'rgba(255,255,255,0.04)',
    gridLineFaint: isLight ? 'rgba(60,60,67,0.05)'    : 'rgba(255,255,255,0.03)',
    tooltipBg:     isLight ? 'rgba(255,255,255,0.98)' : '#1c1c1e',
    tooltipBorder: isLight ? 'rgba(60,60,67,0.18)'   : 'rgba(255,255,255,0.12)',
    tooltipTitle:  isLight ? '#000000'                : '#e8eaf0',
    tooltipBody:   isLight ? 'rgba(60,60,67,0.60)'   : '#8890a4',
    doughnutBorder:isLight ? '#f2f2f7'               : '#1c1c1e',
  };
}

function applyChartDefaults() {
  if (typeof Chart === 'undefined') return;
  const c = getThemeColors();
  Chart.defaults.color       = c.text;
  Chart.defaults.borderColor = c.border;
  Chart.defaults.font        = { family: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", size: 12 };
}

function getTooltipDefaults() {
  const c = getThemeColors();
  return {
    backgroundColor: c.tooltipBg,
    borderColor:     c.tooltipBorder,
    borderWidth: 1,
    padding: { x: 14, y: 10 },
    titleColor: c.tooltipTitle,
    bodyColor:  c.tooltipBody,
    titleFont: { family: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", weight: '600', size: 13 },
    bodyFont:  { family: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", size: 12 },
    cornerRadius: 8,
    displayColors: true,
    boxPadding: 4
  };
}

function currencyTick(v) {
  if (Math.abs(v) >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return 'R$ ' + (v / 1e3).toFixed(0) + 'k';
  return 'R$ ' + v;
}

function currencyLabel(ctx) {
  return ' ' + new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ctx.parsed.y);
}

function lineGradient(chartCtx, hexColor, alpha = 0.18) {
  const [r, g, b] = hexColor.match(/\w\w/g).map(x => parseInt(x, 16));
  const grad = chartCtx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  return grad;
}

function createLineChart(canvas, labels, datasets, opts = {}) {
  applyChartDefaults();
  const c = getThemeColors();
  return new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          display: datasets.length > 1,
          labels: { usePointStyle: true, pointStyleWidth: 8, padding: 20 }
        },
        tooltip: {
          ...getTooltipDefaults(),
          callbacks: opts.currency ? { label: currencyLabel } : {}
        }
      },
      scales: {
        x: {
          grid: { color: c.gridLineFaint },
          ticks: { color: c.textMuted, maxTicksLimit: 8, maxRotation: 0 },
          border: { color: c.border }
        },
        y: {
          grid: { color: c.gridLine },
          ticks: { color: c.textMuted, callback: opts.currency ? currencyTick : undefined },
          border: { display: false }
        }
      },
      elements: {
        line: { tension: 0.4, borderWidth: 2 },
        point: { radius: 0, hoverRadius: 5, hoverBorderWidth: 2, hoverBorderColor: c.doughnutBorder }
      },
      ...(opts.extra || {})
    }
  });
}

function createBarChart(canvas, labels, datasets, opts = {}) {
  applyChartDefaults();
  const c = getThemeColors();
  return new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: datasets.length > 1 },
        tooltip: {
          ...getTooltipDefaults(),
          callbacks: opts.currency ? { label: currencyLabel } : {}
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: c.textMuted, maxRotation: 0 },
          border: { color: c.border }
        },
        y: {
          grid: { color: c.gridLine },
          ticks: { color: c.textMuted, callback: opts.currency ? currencyTick : undefined },
          border: { display: false }
        }
      },
      borderRadius: 4,
      ...(opts.extra || {})
    }
  });
}

function createDoughnutChart(canvas, labels, data, colors, opts = {}) {
  applyChartDefaults();
  const c = getThemeColors();
  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: c.doughnutBorder,
        borderWidth: 3,
        hoverBorderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 18, usePointStyle: true, pointStyleWidth: 8, color: c.text }
        },
        tooltip: {
          ...getTooltipDefaults(),
          callbacks: opts.currency ? {
            label: ctx => ` ${ctx.label}: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ctx.parsed)}`
          } : {}
        }
      },
      ...(opts.extra || {})
    }
  });
}

function createMiniLine(canvas, data, color) {
  applyChartDefaults();
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [{ data, borderColor: color, borderWidth: 1.5, fill: false, tension: 0.4 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      elements: { point: { radius: 0 } }
    }
  });
}
