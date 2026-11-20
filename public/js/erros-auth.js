const ERROS = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-password': 'Digite a senha.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Volte e use "Entrar".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'auth/operation-not-allowed': 'O login por e-mail/senha ainda não foi ativado no Console do Firebase (Authentication > Método de login).',
};

export const mensagemErro = (e) => ERROS[e.code] || `Erro: ${e.message}`;
