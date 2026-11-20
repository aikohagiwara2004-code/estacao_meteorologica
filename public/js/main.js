import { iniciarAutenticacao } from "./auth.js";

// O app só é carregado depois do login: assim nada é lido do banco antes de saber quem é o usuário.
iniciarAutenticacao(() => import("./app.js"));
