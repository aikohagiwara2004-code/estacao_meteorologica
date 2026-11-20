// Projeto Firebase: estacao-meteorologica-ce4fa
// Falta só a apiKey: Console do Firebase > Configurações do projeto > Seus apps > Config.
// Confira também o databaseURL em Realtime Database (muda se a região não for EUA).
export const firebaseConfig = {
  apiKey: "AIzaSyCGsZPeQNjRwtrX_WdC0cTAarpj3yr0Y_A",
  authDomain: "estacao-meteorologica-ce4fa.firebaseapp.com",
  databaseURL: "https://estacao-meteorologica-ce4fa-default-rtdb.firebaseio.com",
  projectId: "estacao-meteorologica-ce4fa",
};

// Google Maps (só visualização — as coordenadas vêm do GPS NEO-6M, não do Google).
// Crie a chave em Google Cloud Console > APIs e serviços > Credenciais,
// restrinja por domínio (HTTP referrers) e apenas à "Maps JavaScript API".
export const googleMapsConfig = {
  apiKey: "AIzaSyDCb3G_hfaZ2IUdPspcILqrWvowN3rPnX0",
  mapId: "DEMO_MAP_ID", // troque por um Map ID próprio (Console > Google Maps Platform > Map Management)
};

// Estrutura esperada no Realtime Database:
//
// leituras/
//   atual: { temperatura, umidade, pressao, luminosidade, gas, latitude, longitude, operador, dispositivo, timestamp }
//   historico/<push_id>: { ...mesmos campos acima... }
//
// sessao/
//   atual: { operador, dispositivo, timestamp }   — escrito pelo dashboard ao "logar"
//   historico/<push_id>: idem, um registro por login
//
// latitude/longitude vêm do módulo GPS (ex: NEO-6M) — envie null se ainda não houver fix.
// operador/dispositivo vêm de sessao/atual — o ESP32 deve consultar esse nó antes de enviar
// cada leitura, para saber quem estava medindo e por qual aparelho a internet estava sendo servida.
