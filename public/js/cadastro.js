import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth } from "./firebase-init.js";
import { mensagemErro } from "./erros-auth.js";

const $ = (id) => document.getElementById(id);

$('cadastro-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erro = $('cadastro-erro');
  erro.textContent = '';

  const nome = $('cad-nome').value.trim();
  const email = $('cad-email').value.trim();
  const senha = $('cad-senha').value;

  if (senha.length < 6) { erro.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
  if (senha !== $('cad-senha2').value) { erro.textContent = 'As senhas não são iguais.'; return; }

  const botao = $('cad-enviar');
  botao.disabled = true;
  botao.textContent = 'Criando…';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    if (nome) await updateProfile(cred.user, { displayName: nome });
    location.href = 'index.html'; // a conta já fica logada; o painel abre direto
  } catch (err) {
    erro.textContent = mensagemErro(err);
    botao.disabled = false;
    botao.textContent = 'Criar conta';
  }
});
