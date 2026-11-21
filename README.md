# Base44 Project

Use this repository to run and edit the app locally, then publish changes back through Base44.

Builder synchronization depends on the GitHub integration configured for the app.

## Prerequisites

1. Clone the repository using the project's Git URL.
2. Navigate to the project directory.
3. Install dependencies: `npm install`.
4. Install the Base44 CLI: `npm install -g base44@latest`.
5. Install [Deno](https://docs.deno.com/runtime/getting_started/installation/) — the local Base44 backend runs on it.

Run `base44 --help` (or see the [CLI reference](https://docs.base44.com/developers/references/cli/commands/introduction)) for the full command surface.

## Run Locally

Three commands, from the project root:

```bash
base44 login   # one-time per machine
base44 link    # one-time per clone
base44 dev     # local backend + frontend together
```

Open the frontend URL that `base44 dev` prints (typically `http://localhost:5173`).

Notes:

- **Every fresh clone needs `base44 link`.** It writes `base44/.app.jsonc` (the app-id pointer), which is deliberately gitignored. Your app id is in the Builder URL (`app.base44.com/apps/<id>/...`); `base44 link --help` shows the non-interactive flags.
- **`base44 dev` runs the frontend for you** (via `site.serveCommand` in this repo's `base44/config.jsonc`) — never run `npm run dev` yourself: alone it serves a UI with no backend behind it (`[base44] Proxy not enabled`, every `/api` call fails), and alongside `base44 dev` the second Vite silently takes the next port and you end up looking at the wrong one.
- **The app must be published at least once for the UI to load under `base44 dev`.** The frontend boots by fetching app settings from the hosted app; before the first publish that fails and every page redirects to login. The local API works regardless.
- Entities, functions, and auth run locally — entity data is **in-memory only**, wiped when `base44 dev` restarts. Everything else (Core integrations, OAuth login) is forwarded to your deployed app. Full breakdown: [Local development overview](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview).

## Frontend Only, Hosted Backend

To work on just the frontend against your app's live hosted backend:

```bash
base44 dev --remote
```

⚠️ In this mode writes go to your app's **production data** — plain `base44 dev` keeps everything local.

## Publish Your Changes

O repositório GitHub contém a interface ContaFlow. A prévia de um editor Base44 sem sincronização pode conter uma revisão diferente. Antes de usar **Publish App** no editor, confira se a prévia usa a interface ContaFlow e se o editor recebeu os arquivos da revisão que você pretende publicar.

No Windows, `Publicar-ContaFlow.cmd` prepara o build e publica somente `payrollService` no app ContaFlow. Uma leitura sem login confirma a versão ativa do endpoint antes de enviar o site compilado com `site deploy`. O script verifica a interface em `/login` após a publicação. `node scripts/verificar-publicacao.mjs` repete as duas leituras sem acessar dados da empresa. A verificação autenticada na tela de folha continua disponível para conferir o caminho usado pelo frontend.

Se a publicação seletiva mostrar `unchanged` e a checagem pública falhar, preserve a produção enquanto compara os logs de `preview` e `prod`. Informe ao suporte Base44 o app, a função, as versões e os IDs das requisições públicas. A publicação do frontend na Vercel tem ciclo próprio e usa o backend no Base44.

## Docs & Support

GitHub integration: [https://docs.base44.com/developers/app-code/local-development/github](https://docs.base44.com/developers/app-code/local-development/github)

Local development: [https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview)

Support: [https://app.base44.com/support](https://app.base44.com/support)
