# Rodando o Emu Launcher como servidor de lobby

Guia pra colocar o app rodando em **modo servidor** (`--server`) no PC dedicado — a
máquina que vai hospedar as partidas de verdade (ver `IDEAS.md` #007 e `CLAUDE.md`,
decisão #6). O mesmo binário que roda como app desktop também roda como servidor
headless; a flag `--server` faz ele pular o Tauri/GTK inteiramente, então funciona sem
monitor plugado (validado na prática — ver Fase 3/#005 e Fase 5a).

## 1. Dependências de sistema

O binário do servidor ainda compila com o Tauri embutido (é o mesmo `Cargo.toml`, só o
`--server` decide em tempo de execução se abre janela ou não) — então as dependências de
build da GUI são necessárias **mesmo numa máquina sem monitor**:

```bash
sudo apt update && sudo apt install -y \
  build-essential libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev pkg-config
```

Rust via [rustup](https://rustup.rs/) (nunca via apt — versão desatualizada):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Node 18+ via [nvm](https://github.com/nvm-sh/nvm) — **necessário mesmo no servidor**: o
Tauri embute os arquivos do frontend compilado (`dist/`) dentro do binário Rust em tempo
de build (`tauri::generate_context!()` exige que `dist/` já exista), então
`npm run build` precisa rodar antes do `cargo build`, mesmo que o servidor nunca abra
essa interface:

```bash
nvm install 18 && nvm alias default 18
```

## 2. Clonar e compilar

O repositório é público, clone direto por HTTPS (sem precisar configurar chave SSH nessa
máquina):

```bash
git clone https://github.com/brunoscv/emu-launcher.git
cd emu-launcher
git checkout EMU-001   # o trabalho de multiplayer ainda não foi mergeado na main

npm install
npm run build

cd src-tauri
cargo build --release   # --release: mais lento pra compilar, mais rápido pra rodar —
                         # vale a pena pra algo que vai ficar no ar continuamente
```

A primeira build demora bastante (alguns minutos) — compila o SQLite embutido
(`rusqlite` bundled), o cliente HTTP (`reqwest`), WebSocket (`tokio-tungstenite`) e o
Tauri inteiro do zero. Builds seguintes são incrementais e bem mais rápidas.

## 3. Rodar em modo servidor

```bash
./target/release/emu-launcher --server
```

Deve aparecer:

```
Servidor de lobby escutando em 0.0.0.0:7777
```

e o processo fica parado ali, sem abrir nenhuma janela — é o esperado, mesmo sem monitor
plugado (testado na prática pelo Bruno na Fase 5a).

**RetroArch: nada pra instalar manualmente.** Diferente do teste isolado que fizemos na
Fase 3 (onde o RetroArch foi baixado à mão só pra validar o conceito), o servidor agora
baixa e instala sozinho a versão gerenciada (1.22.2, mesma versão que o app desktop usa —
`ensure_retroarch_installed`, ver `IDEAS.md` #003) automaticamente **na primeira vez que
uma sala completa e uma partida precisa começar**. Isso só acontece uma vez por máquina;
pode levar alguns minutos nessa primeira partida (download de ~450MB) — as próximas são
instantâneas.

## 4. Indexar as ROMs do servidor

O servidor precisa da própria biblioteca indexada — é dela que as salas listam os jogos
disponíveis pra criar sala (ver `IDEAS.md` #007: "a lista de jogos vem sempre da
biblioteca do próprio servidor", nunca da de quem está criando a sala). Isso ainda não
tem um comando de linha; por enquanto, configure pelo modo desktop:

1. Copie as ROMs que você quer disponibilizar pra essa máquina (ex: `~/roms/snes/`).
2. Rode o app **sem** `--server` uma vez (`./target/release/emu-launcher`) — abre a GUI
   normal.
3. Vá em "⚙ Consoles", habilite os sistemas e aponte a pasta de cada um.
4. Clique em "Reindexar biblioteca".
5. Feche a GUI e volte a rodar com `--server` — o índice já fica salvo no mesmo banco
   SQLite (`~/.local/share/emu-launcher/library.db`), os dois modos leem do mesmo lugar.

## 5. Portas que precisam estar abertas

Se essa máquina tiver firewall ativo (`ufw` ou similar), libere:

- **7777/tcp** — WebSocket do lobby (protocolo próprio, `src-tauri/src/server.rs`)
- **55435/tcp** — netplay nativo do RetroArch (porta padrão, usada pelo host)

```bash
sudo ufw allow 7777/tcp
sudo ufw allow 55435/tcp
```

Isso cobre uso na mesma rede local (LAN). Acesso pela internet pros amigos que não estão
na sua rede ainda depende da Fase 4 (`IDEAS.md` #006 — port-forward/DDNS ou VPN),
**ainda não implementada**.

## 6. Mantendo rodando

Ainda não existe um serviço systemd pronto (isso é a Fase 7 do plano, item futuro). Por
enquanto, pra não perder o processo ao fechar o terminal, use `tmux`/`screen` ou:

```bash
nohup ./target/release/emu-launcher --server > server.log 2>&1 &
```

## 7. Atualizando depois

```bash
git pull
npm install
npm run build
cd src-tauri && cargo build --release
```

(Se a build já estava rodando, mate o processo antigo e suba o novo binário — sem
downtime automático ainda, é manual por enquanto.)

## Verificação rápida

Do notebook cliente, na tela "🎮 Multiplayer" do app desktop, digite o IP dessa máquina no
campo "IP do servidor" e clique "Conectar" — se a lista de jogos do servidor aparecer,
está tudo funcionando.
