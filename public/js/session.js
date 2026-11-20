import { ref, update, push } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { db, auth, caminhoUsuario } from "./firebase-init.js";

const CHAVE_LOCAL = "estacao_operador_nome";

function detectarDispositivo() {
  const ua = navigator.userAgent;
  let sistema = "Dispositivo desconhecido";
  if (/ipad/i.test(ua)) sistema = "iPad";
  else if (/iphone/i.test(ua)) sistema = "iPhone";
  else if (/android/i.test(ua)) sistema = "Android";
  else if (/windows/i.test(ua)) sistema = "Computador (Windows)";
  else if (/macintosh/i.test(ua)) sistema = "Computador (Mac)";

  let navegador = "";
  if (/edg/i.test(ua)) navegador = "Edge";
  else if (/chrome/i.test(ua)) navegador = "Chrome";
  else if (/firefox/i.test(ua)) navegador = "Firefox";
  else if (/safari/i.test(ua)) navegador = "Safari";

  return navegador ? `${sistema} · ${navegador}` : sistema;
}

function registrarSessao(nome) {
  const dados = { operador: nome, dispositivo: detectarDispositivo(), timestamp: Date.now() };
  update(ref(db, caminhoUsuario("sessao/atual")), dados);
  push(ref(db, caminhoUsuario("sessao/historico")), dados);
  return dados;
}

export function iniciarModuloSessao() {
  const overlay = document.getElementById('login-overlay');
  const form = document.getElementById('login-form');
  const inputNome = document.getElementById('login-nome');
  const labelOperador = document.getElementById('operador-atual');
  const btnTrocar = document.getElementById('btn-trocar-operador');

  function entrar(nome) {
    const dados = registrarSessao(nome);
    localStorage.setItem(CHAVE_LOCAL, nome);
    labelOperador.textContent = `Medindo como ${dados.operador} · ${dados.dispositivo}`;
    overlay.classList.add('hidden');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = inputNome.value.trim();
    if (!nome) return;
    entrar(nome);
  });

  btnTrocar.addEventListener('click', () => {
    inputNome.value = '';
    overlay.classList.remove('hidden');
    inputNome.focus();
  });

  // Já logado: usa o nome salvo neste aparelho ou o nome da conta. "Trocar" continua permitindo renomear.
  const u = auth.currentUser;
  const nomeDaConta = u.displayName || (u.email ? u.email.split('@')[0] : 'operador');
  entrar(localStorage.getItem(CHAVE_LOCAL) || nomeDaConta);
}
