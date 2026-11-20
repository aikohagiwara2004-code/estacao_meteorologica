export const metricas = {
  temperatura: { label: 'Temperatura (°C)', color: '#E8A33D' },
  umidade: { label: 'Umidade (%)', color: '#4FD1C5' },
  pressao: { label: 'Pressão (hPa)', color: '#E8654C' },
  luminosidade: { label: 'Luminosidade (raw)', color: '#E8E6DE' },
  gas: { label: 'Qualidade do ar (idx)', color: '#9B8CF2' },
};

export function formatarHora(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function criarGraficoHistorico(canvas) {
  let chaveAtiva = 'temperatura';
  let historicoCache = [];

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: metricas.temperatura.label,
        data: [],
        borderColor: metricas.temperatura.color,
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#7C8AA0' }, grid: { color: 'rgba(255,255,255,.04)' } },
        y: { ticks: { color: '#7C8AA0' }, grid: { color: 'rgba(255,255,255,.04)' } },
      },
      plugins: { legend: { display: false } },
    },
  });

  function redesenhar() {
    chart.data.labels = historicoCache.map(e => formatarHora(e.timestamp));
    chart.data.datasets[0].data = historicoCache.map(e => e[chaveAtiva] ?? null);
    chart.data.datasets[0].label = metricas[chaveAtiva].label;
    chart.data.datasets[0].borderColor = metricas[chaveAtiva].color;
    chart.update();
  }

  return {
    definirHistorico(entradas) {
      historicoCache = entradas;
      redesenhar();
    },
    definirMetricaAtiva(chave) {
      chaveAtiva = chave;
      redesenhar();
    },
  };
}
