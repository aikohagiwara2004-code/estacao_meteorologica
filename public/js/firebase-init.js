import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Todos os dados ficam em usuarios/<uid>/..., e as regras só deixam o dono ler e escrever.
// Só chame depois do login (auth.currentUser precisa existir).
export function caminhoUsuario(sub) {
  return `usuarios/${auth.currentUser.uid}/${sub}`;
}
