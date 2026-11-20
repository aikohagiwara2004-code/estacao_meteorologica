import { ref, onValue, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { db, caminhoUsuario } from "./firebase-init.js";
import { criarGraficoHistorico, formatarHora } from "./chart-panel.js";
import { criarMapa } from "./map-panel.js";
import { iniciarModuloSessao } from "./session.js";
import { iniciarModuloLocalizacao } from "./location.js";

iniciarModuloSessao();
try {
  iniciarModuloLocalizacao();
} catch (e) {
  setTimeout(() => { throw e; }); // aparece na faixa vermelha, sem travar o resto
}

// Mapa criado primeiro: um erro no gráfico não pode impedir o mapa de carregar
const mapa = criarMapa('map');

const dot = document.getElementById('dot');
const statusText = document.getElementById('status-text');

onValue(ref(db, ".info/connected"), (snap) => {
  const conectado = snap.val() === true;
  dot.className = `h-2 w-2 rounded-full ${conectado ? 'bg-teal animate-pulse' : 'bg-alert'}`;
  statusText.textContent = conectado ? 'Conectado' : 'Sem conexão';
});

function classificarGas(v) {
  if (v == null) return '—';
  if (v < 1500) return 'Ar bom';
  if (v < 2800) return 'Moderado — ventile o ambiente';
  return 'Ruim — verifique ventilação';
}

function classificarLuz(pct) {
  if (pct < 15) return 'Escuro';
  if (pct < 50) return 'Nublado / interior';
  return 'Bastante luz';
}

function condicaoGeral(t, u) {
  if (t == null) return 'Aguardando leitura';
  if (t >= 30) return u >= 70 ? 'Calor e abafado' : 'Calor';
  if (t <= 15) return 'Frio';
  return u >= 70 ? 'Ameno e úmido' : 'Agradável';
}

const ORIGENS = { gps: 'GPS do medidor', celular: 'Celular', fixo: 'Local salvo' };

function mostrarPosicao(lat, lon, origem, nome, dadosMapa) {
  document.getElementById('val-coords').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  const o = ORIGENS[origem] || 'GPS do medidor';
  document.getElementById('gps-status').textContent = nome ? `${o} · ${nome}` : o;
  document.getElementById('link-maps').href = `https://www.google.com/maps?q=${lat},${lon}`;
  mapa.atualizarPosicaoAtual(lat, lon, dadosMapa);
}

onValue(ref(db, caminhoUsuario("leituras/atual")), (snap) => {
  const d = snap.val();
  if (!d) return;

  if (d.temperatura != null) window.animarValor(document.getElementById('val-temp'), d.temperatura, 1);
  if (d.umidade != null) window.animarValor(document.getElementById('val-umid'), d.umidade, 0);
  if (d.pressao != null) window.animarValor(document.getElementById('val-pressao'), d.pressao, 1);

  if (d.luminosidade != null) {
    const pct = Math.min(100, Math.round((d.luminosidade / 4095) * 100));
    window.animarValor(document.getElementById('val-luz'), pct, 0);
    document.getElementById('desc-luz').textContent = classificarLuz(pct);
  }
  if (d.gas != null) {
    window.animarValor(document.getElementById('val-gas'), d.gas, 0);
    document.getElementById('desc-gas').textContent = classificarGas(d.gas);
  }

  document.getElementById('condition-label').textContent = condicaoGeral(d.temperatura, d.umidade);
  document.getElementById('last-update').textContent = formatarHora(d.timestamp);

  const elMedidoPor = document.getElementById('val-medido-por');
  if (elMedidoPor) {
    elMedidoPor.textContent = d.operador ? `${d.operador} · ${d.dispositivo || 'dispositivo não identificado'}` : '—';
  }

  if (d.latitude != null && d.longitude != null) {
    mostrarPosicao(d.latitude, d.longitude, d.origem_local, d.nome_local, d);
  }
});

// Posição escolhida no painel "Onde está o medidor?" (funciona mesmo sem o ESP32 enviando leituras)
let ultimaPosSessao = '';
onValue(ref(db, caminhoUsuario("sessao/atual")), (snap) => {
  const s = snap.val();
  if (!s || s.latitude == null || s.longitude == null) return;
  const chave = `${s.latitude},${s.longitude},${s.nome_local}`;
  if (chave === ultimaPosSessao) return; // ignora só a renovação do carimbo de tempo
  ultimaPosSessao = chave;
  mostrarPosicao(s.latitude, s.longitude, s.modo, s.nome_local,
    { operador: s.operador, nome_local: s.nome_local, timestamp: s.posicao_ts });
});

// ---- Gráfico histórico ----
const grafico = criarGraficoHistorico(document.getElementById('chart'));

onValue(query(ref(db, caminhoUsuario("leituras/historico")), limitToLast(20)), (snap) => {
  const dados = snap.val() || {};
  const entradas = Object.values(dados).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  grafico.definirHistorico(entradas);
  mapa.atualizarCaminho(entradas);
});

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  grafico.definirMetricaAtiva(btn.dataset.key);
});
