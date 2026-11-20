import { googleMapsConfig } from "./config.js";
import { formatarHora } from "./chart-panel.js";

// Carrega a Maps JavaScript API sob demanda (modo assíncrono recomendado pelo Google)
function carregarGoogleMaps(apiKey) {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.__gmapsPronto = resolve;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly&callback=__gmapsPronto`;
    s.async = true;
    s.onerror = () => reject(new Error('Não foi possível carregar o Google Maps (verifique a conexão).'));
    document.head.append(s);
  });
}

function criarPino() {
  const el = document.createElement('div');
  el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#E8A33D;border:3px solid #fff;box-shadow:0 0 0 6px rgba(232,163,61,.3);cursor:pointer';
  return el;
}

// Monta o conteúdo com textContent (nunca innerHTML): o nome do operador é digitado por usuários
function montarInfo(d) {
  const el = document.createElement('div');
  el.style.cssText = 'font-family:Inter,sans-serif;color:#14202B;font-size:13px;line-height:1.5';
  const linhas = [];
  if (d.temperatura != null) linhas.push(`Temperatura: ${Number(d.temperatura).toFixed(1)} °C`);
  if (d.umidade != null) linhas.push(`Umidade: ${Math.round(d.umidade)} %`);
  if (d.pressao != null) linhas.push(`Pressão: ${Number(d.pressao).toFixed(1)} hPa`);
  if (d.operador) linhas.push(`Medido por: ${d.operador}`);
  if (d.nome_local) linhas.push(`Local: ${d.nome_local}`);
  linhas.push(`Horário: ${formatarHora(d.timestamp)}`);
  for (const t of linhas) {
    const row = document.createElement('div');
    row.textContent = t;
    el.append(row);
  }
  return el;
}

// Retorna na hora um objeto com métodos; as chamadas esperam a API terminar de carregar.
export function criarMapa(containerId) {
  const container = document.getElementById(containerId);

  function mostrarMensagem(msg) {
    container.replaceChildren();
    const p = document.createElement('p');
    p.className = 'text-slate text-sm p-6';
    p.textContent = msg;
    container.append(p);
  }

  mostrarMensagem('Carregando mapa…');
  const timer = setTimeout(() => mostrarMensagem(
    'O Google Maps demorou para responder. Confira a chave, a API ativada, o faturamento e as restrições no Google Cloud.'
  ), 10000);

  // O Google chama esta função global quando a chave é recusada
  window.gm_authFailure = () =>
    mostrarMensagem('Chave do Google Maps recusada. Confira a chave, as restrições de domínio e se o faturamento está ativo.');

  const pronto = (async () => {
    const { apiKey, mapId } = googleMapsConfig;
    if (!apiKey || apiKey.startsWith('SUA_')) {
      throw new Error('Configure googleMapsConfig.apiKey em js/config.js para ver o mapa.');
    }
    await carregarGoogleMaps(apiKey);
    const { Map, Polyline, InfoWindow } = await google.maps.importLibrary('maps');
    const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

    clearTimeout(timer);
    container.replaceChildren();
    const mapa = new Map(container, {
      center: { lat: -14.2, lng: -51.9 }, // Brasil, até chegar o primeiro fix
      zoom: 4,
      mapId: mapId || 'DEMO_MAP_ID',
      colorScheme: 'DARK', // só tem efeito em mapas vetoriais (Map ID)
      streetViewControl: false,
      fullscreenControl: true,
    });

    const trilha = new Polyline({ map: mapa, path: [], strokeColor: '#4FD1C5', strokeOpacity: 0.85, strokeWeight: 3 });
    const janela = new InfoWindow();
    let marcador = null;

    return {
      atualizarPosicaoAtual(lat, lon, dados = {}) {
        const pos = { lat, lng: lon };
        janela.setContent(montarInfo(dados));
        if (!marcador) {
          const pino = criarPino();
          marcador = new AdvancedMarkerElement({ map: mapa, position: pos, content: pino, title: 'Última leitura', zIndex: 10 });
          pino.addEventListener('click', () => janela.open({ map: mapa, anchor: marcador }));
          mapa.setCenter(pos);
          mapa.setZoom(16);
        } else {
          marcador.position = pos;
          if (!mapa.getBounds()?.contains(pos)) mapa.panTo(pos); // acompanha só se sair da tela
        }
      },
      atualizarCaminho(pontos) {
        trilha.setPath(
          pontos
            .filter(p => p.latitude != null && p.longitude != null)
            .map(p => ({ lat: p.latitude, lng: p.longitude }))
        );
      },
    };
  })();

  pronto.catch(e => mostrarMensagem(e.message));

  return {
    atualizarPosicaoAtual: (...args) => pronto.then(m => m.atualizarPosicaoAtual(...args)).catch(() => {}),
    atualizarCaminho: (...args) => pronto.then(m => m.atualizarCaminho(...args)).catch(() => {}),
  };
}
