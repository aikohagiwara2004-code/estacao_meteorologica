import { ref, update, push, remove, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { db, caminhoUsuario } from "./firebase-init.js";

const refCtx = ref(db, caminhoUsuario("sessao/atual"));
const refLocais = ref(db, caminhoUsuario("locais"));
const FLAG_CELULAR = "estacao_loc_celular";
const CHAVE_OPERADOR = "estacao_operador_nome";

const $ = (id) => document.getElementById(id);

function distanciaM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function textoErroGeo(e) {
  if (e.code === 1) return 'Permissão de localização negada. Libere nas configurações do navegador e tente de novo.';
  if (e.code === 3) return 'Tempo esgotado ao buscar a posição. Vá para um local aberto e tente de novo.';
  return 'Não foi possível obter a posição deste aparelho.';
}

function pegarPosicaoUmaVez() {
  return new Promise((ok, erro) =>
    navigator.geolocation.getCurrentPosition(ok, erro, { enableHighAccuracy: true, timeout: 20000 }));
}

export function iniciarModuloLocalizacao() {
  const ids = ['modos', 'painel-fixo', 'loc-select', 'loc-usar', 'loc-remover', 'loc-nome', 'loc-salvar', 'loc-status'];
  const faltando = ids.filter(id => !$(id));
  if (faltando.length) {
    throw new Error('O index.html está desatualizado (faltam: ' + faltando.join(', ') + '). Substitua pelo index.html da versão nova.');
  }

  let locais = {};
  let ctx = {};
  let aviso = '';
  let watchId = null;
  let batida = null;
  let ultimaPos = null;
  let ultimaEscrita = { t: 0, lat: null, lon: null };
  let primeiraLeitura = true;

  function desenharStatus() {
    let txt = 'Escolha de onde vem a localização das leituras.';
    if (ctx.modo === 'fixo') txt = `Usando o local salvo: ${ctx.nome_local || '—'}.`;
    if (ctx.modo === 'gps') txt = 'Usando o GPS do próprio medidor.';
    if (ctx.modo === 'celular') {
      txt = ctx.latitude != null
        ? `Usando a localização do celular${ctx.precisao_m ? ` (precisão de cerca de ${ctx.precisao_m} m)` : ''}. Mantenha esta página aberta e a tela ligada.`
        : 'Buscando a posição do celular…';
    }
    $('loc-status').textContent = aviso || txt;
  }

  function desenharLocais() {
    const sel = $('loc-select');
    const atual = sel.value;
    sel.replaceChildren();
    const entradas = Object.entries(locais);
    if (!entradas.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'Nenhum local salvo';
      sel.append(o);
      return;
    }
    for (const [id, l] of entradas) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = l.nome;
      sel.append(o);
    }
    const ativo = ctx.modo === 'fixo' ? entradas.find(([, l]) => l.nome === ctx.nome_local) : null;
    sel.value = ativo ? ativo[0] : (locais[atual] ? atual : entradas[0][0]);
  }

  function desenhar() {
    document.querySelectorAll('.modo-btn').forEach(b => b.classList.toggle('active', b.dataset.modo === ctx.modo));
    desenharStatus();
    desenharLocais();
  }

  function pararCelular() {
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (batida) { clearInterval(batida); batida = null; }
    ultimaPos = null;
    localStorage.removeItem(FLAG_CELULAR);
  }

  function iniciarCelular() {
    if (!navigator.geolocation) { aviso = 'Este navegador não oferece localização.'; desenhar(); return; }
    pararCelular();
    aviso = '';
    localStorage.setItem(FLAG_CELULAR, '1');
    const nome = `Celular de ${localStorage.getItem(CHAVE_OPERADOR) || 'operador'}`;

    // Limpa coordenadas antigas: até o primeiro fix, o ESP32 usa o próprio GPS
    update(refCtx, { modo: 'celular', latitude: null, longitude: null, precisao_m: null, nome_local: null, posicao_ts: null });

    watchId = navigator.geolocation.watchPosition((p) => {
      const { latitude, longitude, accuracy } = p.coords;
      ultimaPos = { latitude, longitude };
      const moveu = ultimaEscrita.lat == null ||
        distanciaM({ lat: ultimaEscrita.lat, lon: ultimaEscrita.lon }, { lat: latitude, lon: longitude }) > 15;
      if (!moveu && Date.now() - ultimaEscrita.t < 15000) return;
      ultimaEscrita = { t: Date.now(), lat: latitude, lon: longitude };
      update(refCtx, { modo: 'celular', latitude, longitude, precisao_m: Math.round(accuracy), nome_local: nome, posicao_ts: serverTimestamp() });
    }, (e) => {
      aviso = textoErroGeo(e);
      if (e.code === 1) pararCelular();
      desenhar();
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });

    // Mesmo parado, renova o carimbo de tempo para o ESP32 saber que a posição está viva
    batida = setInterval(() => {
      if (ultimaPos) update(refCtx, { modo: 'celular', posicao_ts: serverTimestamp() });
    }, 20000);
  }

  function aplicarFixo(nome, lat, lon) {
    pararCelular();
    aviso = '';
    update(refCtx, { modo: 'fixo', latitude: lat, longitude: lon, nome_local: nome, precisao_m: null, posicao_ts: serverTimestamp() });
  }

  function usarGpsDoMedidor() {
    pararCelular();
    aviso = '';
    update(refCtx, { modo: 'gps', latitude: null, longitude: null, nome_local: null, precisao_m: null, posicao_ts: null });
  }

  $('modos').addEventListener('click', (e) => {
    const b = e.target.closest('.modo-btn');
    if (!b) return;
    const modo = b.dataset.modo;
    if (modo === 'fixo') { $('painel-fixo').classList.toggle('hidden'); return; }
    $('painel-fixo').classList.add('hidden');
    if (modo === 'celular') iniciarCelular(); else usarGpsDoMedidor();
  });

  $('loc-usar').addEventListener('click', () => {
    const l = locais[$('loc-select').value];
    if (!l) { aviso = 'Salve um local primeiro.'; desenhar(); return; }
    aplicarFixo(l.nome, l.latitude, l.longitude);
  });

  $('loc-remover').addEventListener('click', () => {
    const id = $('loc-select').value;
    if (id && confirm('Remover este local salvo?')) remove(ref(db, caminhoUsuario(`locais/${id}`)));
  });

  $('loc-salvar').addEventListener('click', async () => {
    const nome = $('loc-nome').value.trim();
    if (!nome) { aviso = 'Dê um nome ao local (ex: Casa).'; desenhar(); return; }
    if (!navigator.geolocation) { aviso = 'Este navegador não oferece localização.'; desenhar(); return; }
    $('loc-status').textContent = 'Buscando a posição deste aparelho…';
    try {
      const p = await pegarPosicaoUmaVez();
      const { latitude, longitude } = p.coords;
      await push(refLocais, { nome, latitude, longitude });
      $('loc-nome').value = '';
      aplicarFixo(nome, latitude, longitude);
    } catch (e) {
      aviso = e.code ? textoErroGeo(e) : 'Não foi possível salvar o local. Confira sua conexão.';
      desenhar();
    }
  });

  onValue(refLocais, (snap) => { locais = snap.val() || {}; desenhar(); });

  onValue(refCtx, (snap) => {
    ctx = snap.val() || {};
    if (ctx.modo !== 'celular' && watchId != null) pararCelular();
    if (primeiraLeitura) {
      primeiraLeitura = false;
      if (ctx.modo === 'fixo') $('painel-fixo').classList.remove('hidden');
      if (ctx.modo === 'celular' && localStorage.getItem(FLAG_CELULAR) === '1') iniciarCelular();
    }
    desenhar();
  });
}
