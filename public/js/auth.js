import {
  onAuthStateChanged, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth } from "./firebase-init.js";
import { mensagemErro } from "./erros-auth.js";

const $ = (id) => document.getElementById(id);

// Chama aoEntrar(user) uma única vez, assim que houver um usuário logado.
export function iniciarAutenticacao(aoEntrar) {
  const overlay = $('auth-overlay');
  const erro = $('auth-erro');
  let iniciado = false;

  const mostrarErro = (e) => { erro.textContent = mensagemErro(e); };
  const credenciais = () => ({ email: $('auth-email').value.trim(), senha: $('auth-senha').value });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      overlay.classList.add('hidden');
      $('conta-atual').textContent = user.email;
      if (!iniciado) { iniciado = true; aoEntrar(user); }
    } else if (iniciado) {
      location.reload(); // saiu da conta: recarrega para limpar tudo da tela
    } else {
      overlay.classList.remove('hidden');
    }
  });

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.textContent = '';
    const { email, senha } = credenciais();
    try { await signInWithEmailAndPassword(auth, email, senha); } catch (err) { mostrarErro(err); }
  });

  $('auth-esqueci').addEventListener('click', async () => {
    const { email } = credenciais();
    if (!email) { erro.textContent = 'Digite seu e-mail e toque em "Esqueci a senha" de novo.'; return; }
    try {
      await sendPasswordResetEmail(auth, email);
      erro.textContent = 'Enviamos um e-mail para redefinir a senha (veja também o spam).';
    } catch (err) { mostrarErro(err); }
  });

  $('btn-sair').addEventListener('click', async () => {
    // para de compartilhar a localização deste celular e esquece o nome deste aparelho
    localStorage.removeItem('estacao_loc_celular');
    localStorage.removeItem('estacao_operador_nome');
    await signOut(auth);
  });
}
