# Emu Launcher

Launcher de emuladores estilo Batocera/EmulationStation, com foco em **jogar online com
amigos sem fricção** — o problema que motivou o projeto foi um site de emulação nunca
reconhecer o controle USB de um amigo, forçando ele a jogar de teclado.

Roda o [RetroArch](https://www.retroarch.com/) nativo por trás de uma UI própria: nada de
reimplementar netcode — o netplay rollback do RetroArch já é maduro, o launcher só cuida da
experiência (indexar sua biblioteca, escolher o jogo, calibrar o controle).

## Funcionalidades

- **Biblioteca indexada em SQLite** — cada console tem sua própria pasta de roms
  configurável; a varredura pesada (`reindex_library`) roda só quando você pede, a listagem
  do dia a dia (`list_library`) lê do banco e é instantânea
- **Menu de consoles** — escolha quais sistemas você emula e onde estão as roms de cada um
- **Busca, navegação por letra (0-9/# → A-Z) e paginação de 50 em 50** — pensado pra
  bibliotecas grandes (testado com ~2000 jogos de SNES) sem pesar a renderização
- **Lançamento assíncrono do emulador** — dispara o RetroArch via `Command::spawn` no lado
  Rust e emite um evento quando o processo fecha, sem travar a UI
- **Módulo de gamepad** (`src/gamepad/`) — calibração manual por `gamepad.id`, resolve
  controles de terceiros que o browser não mapeia como `"standard"` (ainda não integrado
  na tela principal)

## Stack

- **Backend**: Rust + [Tauri v2](https://v2.tauri.app/)
- **Frontend**: React 18 + TypeScript + Vite 5
- **Índice local**: SQLite via `rusqlite`
- **Emulação**: RetroArch instalado no sistema, orquestrado via Tauri commands

## Rodando localmente

Dependências de sistema (Ubuntu/Debian):

```bash
sudo apt update && sudo apt install -y \
  build-essential libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev pkg-config
```

Rust (via [rustup](https://rustup.rs/), não via apt) e Node 18+ (via [nvm](https://github.com/nvm-sh/nvm)):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
nvm install 18 && nvm alias default 18
```

Projeto:

```bash
npm install
npm run tauri dev
```

No primeiro uso, abra "⚙ Consoles" e configure a pasta de roms de cada sistema que você
quer emular, depois clique em "Reindexar biblioteca".

## Estrutura

```
src-tauri/src/
├── main.rs      # registra os commands Tauri
├── db.rs        # conexão SQLite + schema
├── library.rs   # commands de configuração de consoles e índice da biblioteca
├── scanner.rs   # varredura de pasta de rom por sistema
├── launcher.rs  # dispara o RetroArch
└── systems.rs   # mapeamento sistema → emulador/core

src/
├── App.tsx
├── components/       # UI: lista de jogos, abas de sistema/letra, paginação, config
├── gamepad/          # calibração de controle (não integrado ainda)
└── types/rom.ts       # tipos espelhando as structs Rust
```

## Roadmap

O plano de longo prazo (netplay via RetroArch, auto-instalação de emuladores, servidor de
lobby, modo local vs. servidor, servidor headless com streaming) está documentado em
[`CLAUDE.md`](./CLAUDE.md). Ideias em avaliação, implementadas ou descartadas — com o
porquê de cada decisão — ficam em [`IDEAS.md`](./IDEAS.md).
