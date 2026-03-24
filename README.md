# FindYourSong — Instruções de desenvolvimento

Este README descreve como iniciar o ambiente de desenvolvimento local no Windows (PowerShell) e algumas dicas para resolver problemas intermitentes.

## Requisitos

- Node.js (versão recomendada: 18.x ou 20.x)
- npm
- Ionic CLI (opcional, o projeto usa `npx ionic` quando não está instalado globalmente)

Verifique as versões:

```powershell
node -v
npm -v
```

Se `npm` ou `node` não forem encontrados, instale o Node.js a partir de https://nodejs.org/ ou use o nvm-windows para gerenciar versões.

## Comandos úteis

Na raiz do projeto (`C:\Users\diihr\FindYourSong`):

- Iniciar o dev-server (rápido):

```powershell
npm start
```

- Iniciar o dev-server com limpeza automática do cache (recomendado se o projeto apresentar erros de chunks/otimizações):

```powershell
npm run start:dev
```

O script `start:dev` executa um helper PowerShell que remove `.angular/cache` e inicia o servidor (usa `ionic` se estiver instalado globalmente, senão usa `npx ionic`).

- Alternativa direta (se preferir):

```powershell
npx ionic serve -- --proxy-config proxy.conf.json
```

- Build de produção:

```powershell
npm run build
```

## Proxy / CORS

O projeto já contém um arquivo `proxy.conf.json` que encaminha chamadas para `/api` ao endpoint do Deezer (`https://api.deezer.com`). Use o comando com `--proxy-config` (já incluído em `start`/`start:dev`) para evitar problemas de CORS no desenvolvimento.

Exemplo de endpoint no app: `http://localhost:8100/api/search?q=...`

## Problemas comuns e soluções

- Erros de chunks, `Failed to fetch dynamically imported module`, `Outdated Optimize Dep`, ou `Cannot read properties of null (reading 'nodeType')`:
  - Pare o dev-server (Ctrl+C).
  - Execute `npm run start:dev` para limpar o cache e iniciar com proxy.
  - Se persistir, remova `node_modules` e reinstale:

```powershell
rm -Recurse -Force node_modules
npm ci
npm run start:dev
```

- Comando `npm run start` retorna algo como "'run' não é um comando válido":
  - Use `npm run start` ou `npm start`. Não digite apenas `run start`.
  - Se `npm` não for encontrado, verifique o PATH ou reinstale Node.js.

- Se `ionic` não for reconhecido: o script usa `npx ionic` automaticamente; você pode instalar globalmente com:

```powershell
npm install -g @ionic/cli
```

## Dicas de desenvolvimento

- Mantenha o Node e dependências em versões estáveis (use `package-lock.json` e `npm ci` em máquinas novas).
- Se colaborar em equipe, documente o comando `npm run start:dev` para evitar perda de tempo com inconsistências.

## Contato

Se encontrar erros novos, cole aqui as saídas do terminal e os logs do DevTools (Console e Network). Logs úteis:

- Console: mensagens de erro e `console.error` do app
- Network: requests para `/api/...` (Status, Response)

---
README gerado automaticamente — edite conforme necessário.
