# Banco de Ideias — Emu Launcher

> Registro de ideias que surgem durante o desenvolvimento, mesmo as que não vão ser
> implementadas já. Serve pra não perder o fio e pra consultar depois "isso aqui eu já
> pensei, tá anotado, qual o status?".

**Legenda de status:** 💡 Proposta (só a ideia, sem plano técnico) · 🔧 Planejada (tem plano
técnico, ainda não começou) · 🚧 Em andamento · ✅ Implementada · ❌ Descartada (com o motivo)

---

## 🔧 #001 — Modo Standalone vs. Modo Servidor (multiplayer)

**Registrada em:** 10/08/2026 · **Atualizada em:** 10/08/2026 (arquitetura do servidor corrigida — ver nota abaixo)

**A ideia:** o notebook antigo (i7-3537U) fica dedicado a jogar sozinho, localmente, sem
depender de nada externo. Quando quiser jogar com os amigos, o servidor de lobby roda no
outro PC (i5 3ª geração + GTX 1050 Ti) e o notebook se **conecta** nele como cliente —
dois modos de uso do mesmo app, não dois apps diferentes.

**Por que faz sentido:** separa preocupações — o modo local nunca depende de rede/servidor
pra funcionar (resiliente, simples, rápido), e o modo multiplayer é oferecido como uma
camada opcional por cima, sem forçar complexidade em quem só quer jogar sozinho.

> **Nota de correção (10/08/2026):** a v1 desse plano assumia que o servidor só coordenava
> o lobby e o RetroArch host rodava na máquina de um dos jogadores (P2P puro). Decisão
> revista com o Bruno: o **servidor também hospeda a partida de verdade** — roda o
> RetroArch nativo em modo headless (sem monitor) e é sempre o host do netplay; os
> jogadores (Bruno + amigos) só conectam nele como clientes. Isso é diferente da decisão
> #6 do `CLAUDE.md` (streaming de vídeo via NVENC/WebRTC pra navegador, sem instalar nada)
> — aqui continua sendo RetroArch nativo instalado em cada máquina, só que o host de cada
> partida é sempre o servidor, não mais rotativo entre jogadores. Ver `IDEAS.md` #003-#006
> pro plano faseado completo (instalador, player count, prova de conceito headless, acesso
> pela internet) que essa ideia agora depende.

### Plano técnico inicial (revisado)

1. **Config de conexão** — nova tela de configurações com um campo "Endereço do servidor
   de lobby" (IP:porta do PC dedicado) e um toggle "Jogar sozinho" / "Conectar ao servidor".
2. **Modo local (já existe, é o comportamento atual)** — índice SQLite local
   (`list_library`/`reindex_library`, ver #002), `launch_emulator` dispara RetroArch direto,
   sem nenhuma dependência de rede.
3. **Modo servidor** — o app abre uma conexão WebSocket com o servidor de lobby (ver #007):
   criar sala, convidar, confirmação de "pronto", status do gamepad de cada jogador,
   atribuição de porta/Multitap baseada no máximo de jogadores do jogo escolhido (#004).
   Quando a partida começa, o servidor dispara o **próprio** RetroArch dele em modo host
   (headless, ver #005) — o cliente local só conecta nesse host, não roda o jogo localmente
   quando em modo servidor.
4. **Indicador de estado de conexão na UI** — algo simples tipo um badge no header
   mostrando "🟢 Conectado ao servidor" / "⚪ Modo local", pra ficar óbvio em qual modo o
   app está rodando.

**Depende de:** #003 (instalador com versão fixa), #004 (player count por jogo), #005
(prova de conceito de RetroArch headless), #006 (acesso pela internet) e #007 (servidor de
lobby em si) — nessa ordem. Essa ideia aqui é a "cola" final (toggle + UI) depois que as
peças de baixo já existirem.

---

## ✅ #003 — Instalador do RetroArch com versão fixa (Linux + Windows)

**Registrada em:** 10/08/2026 · **Implementada em:** 10/08/2026 (branch `EMU-001`) — só
Linux validado de verdade (download + extração + execução do AppImage confirmados ao
vivo); Windows implementado com a mesma lógica mas ainda não testado numa máquina Windows
real, ver nota de risco no final.

**A ideia:** todo mundo que participa de uma partida (Bruno + amigos, seja standalone ou
via servidor) precisa rodar **exatamente a mesma versão** de RetroArch e dos cores — é
requisito do próprio netplay do RetroArch, que sincroniza estado entre host/clientes e
não tolera versões divergentes. Em vez de pedir pra cada amigo instalar RetroArch por
conta própria (versões diferentes, cores diferentes, dor de cabeça), o app baixa e instala
sozinho a versão certa, isolada do RetroArch "do sistema" se já existir algum.

**Versão fixada:** `1.18.0` — a que o Bruno já tem instalada e validada funcionando
(`retroarch --version` confirmado em 10/08/2026).

### Plano técnico inicial

1. **Verificar antes de codar:** confirmar se `buildbot.libretro.com` serve builds
   estáveis versionadas (ex: uma pasta `/1.18.0/`) ou só nightly rolante — se for só
   nightly, a estratégia de "sempre a mesma versão" precisa baixar uma nightly específica
   por hash/data e guardar essa referência, não simplesmente "a mais nova". Isso decide o
   formato exato da URL que o comando abaixo usa.
2. **Novo command Rust `ensure_retroarch_installed`** — detecta se já existe uma instalação
   gerenciada pelo app na versão certa; se não, baixa o binário do RetroArch e os cores
   necessários (snes9x, fceumm, pcsx_rearmed, os que `systems.rs` já referencia) pro SO
   atual, extrai numa pasta própria do app (ex: `~/.local/share/emu-launcher/retroarch/` no
   Linux, equivalente no Windows) — não depende do RetroArch instalado via apt/instalador
   oficial do usuário.
3. **`systems.rs`** passa a apontar `emulator_path`/`extra_args` pra essa instalação
   gerenciada, não mais pro `retroarch` do PATH do sistema.
4. **Suporte a Windows** — formato de artefato e nome de executável diferentes do Linux;
   `std::env::consts::OS` decide qual baixar. Testar numa VM ou máquina Windows real antes
   de considerar pronto.

**Critério de sucesso:** rodar `ensure_retroarch_installed` numa máquina Linux limpa e numa
Windows limpa (ou VM) e conseguir abrir um jogo, sem nenhum passo manual.

### O que foi confirmado na prática (não presumido)

- A versão que o Bruno tinha (1.18.0) veio do **apt do Ubuntu 24.04**, nunca existiu no
  buildbot (que pula de 1.17.0 direto pra 1.19.0) — por isso a versão fixada mudou pra
  **1.22.2** (mais recente estável do buildbot), com o aval do Bruno pra substituir a
  instalação via apt em todas as máquinas.
- Estrutura real do buildbot, confirmada baixando e inspecionando os `.7z` de verdade:
  - Linux: `RetroArch-Linux-x86_64/RetroArch-Linux-x86_64.AppImage` (+ pasta
    `RetroArch-Linux-x86_64.AppImage.home/.config/retroarch/cores/` — convenção de "home
    portátil" do AppImage, populada extraindo `RetroArch_cores.7z` no mesmo destino)
  - Windows: `RetroArch-Win64/retroarch.exe` + `RetroArch-Win64/cores/`
  - Os dois SOs têm exatamente `snes9x_libretro`, `fceumm_libretro` e `pcsx_rearmed_libretro`
    (`.so` no Linux, `.dll` no Windows) — bate com o que `systems.rs` já esperava.
- **Validado ao vivo no Linux:** download real (~450MB), extração via crate `sevenz-rust`,
  `chmod +x` no AppImage, e execução (`--version` reportando `1.22.2` de verdade). Teste
  fica em `src-tauri/src/retroarch.rs` como `#[ignore]` (`cargo test -- --ignored
  --nocapture`) pra reverificar no futuro sem rodar em todo `cargo test`.
- **Risco em aberto:** Windows usa a mesma lógica de código, mas **não foi testado numa
  máquina Windows real** — fica pendente pra quando um amigo com Windows testar de verdade
  (ou o Bruno rodar numa VM). Também vale registrar pra fase futura (#005, servidor
  headless): o Linux usa AppImage, que normalmente precisa de FUSE pra rodar — não é
  problema no desktop do Bruno (testado, funcionou), mas pode ser um obstáculo num servidor
  headless sem FUSE disponível; investigar `--appimage-extract` como alternativa se
  acontecer.

---

## 🔧 #004 — Metadata de "número de jogadores" por jogo

**Registrada em:** 10/08/2026

**A ideia:** o lobby (#007) precisa saber quantos jogadores um jogo específico suporta pra
abrir a sala com o número certo de vagas (ex: Superstar Soccer Deluxe e NBA Jam Tournament
Edition = até 4 via Multitap; a maioria dos outros SNES = 2). Isso **não dá pra descobrir
lendo o core libretro** — cores expõem no máximo quantas portas de controle o *sistema*
aceita, não se aquela *ROM específica* usa as portas extras. É característica do jogo, não
do core.

### Plano técnico inicial

1. **Fonte automática:** durante o `reindex_library` (#002), consultar ScreenScraper ou
   IGDB pelo nome do jogo (mesmo mecanismo cogitado pras capas no adendo do #002) e gravar
   o número de jogadores retornado.
2. **Tabela de override manual (SQLite):** nova tabela, ex.
   `game_player_overrides(rom_path TEXT PRIMARY KEY, max_players INTEGER, uses_multitap INTEGER)`
   — o Bruno corrige manualmente quando a fonte automática errar ou não tiver o jogo
   catalogado (bem provável pro caso específico do Multitap, que é uma informação meio de
   nicho).
3. **Precedência:** override manual sempre vence o valor automático quando existir uma
   linha pro `rom_path`.

**Depende de:** #002 (já implementado) pro pipeline de reindexação onde essa busca entra.

**Critério de sucesso:** a lista mostra "até 4 jogadores" pro Superstar Soccer Deluxe (via
override manual, ao menos no início) e um número plausível pra maioria dos outros SNES via
busca automática, sem o Bruno ter digitado isso à mão pra cada jogo da biblioteca.

---

## 🔧 #005 — RetroArch headless no servidor dedicado (prova de conceito)

**Registrada em:** 10/08/2026

**A ideia:** antes de construir o lobby (#007) em cima da suposição de que "o servidor
consegue hospedar uma partida de RetroArch sem monitor", validar isso isoladamente. É o
maior risco técnico do plano faseado inteiro — se não funcionar do jeito esperado (driver
de vídeo sem X, saída de áudio sem dispositivo real, etc.), é melhor descobrir aqui do que
depois de já ter o lobby inteiro escrito em cima.

### Plano técnico inicial

1. Testar RetroArch rodando sem monitor físico no PC dedicado (Xvfb + driver de vídeo, ou
   investigar se algum driver "null"/dummy do próprio RetroArch resolve sem precisar de X
   virtual) atuando como host de netplay.
2. Validar áudio headless (dummy/null audio driver — não precisa de som de verdade saindo
   de lugar nenhum, só não pode travar o processo).
3. Teste real: Bruno + 1 amigo conectando via RetroArch nativo (cliente normal, instalado
   via #003) nesse host headless, jogando um jogo de SNES qualquer, na LAN.

**Depende de:** #003 (a mesma versão fixa de RetroArch precisa estar rodando no servidor).

**Critério de sucesso:** os dois conseguem jogar uma partida completa contra/junto no host
headless, sem crash, com input responsivo.

---

## 🔧 #006 — Acesso pela internet pro servidor de lobby

**Registrada em:** 10/08/2026

**A ideia:** os amigos vão estar em casas diferentes, não na mesma rede do Bruno — então o
servidor (lobby + RetroArch headless de #005) precisa ser alcançável pela internet, não só
na LAN.

### Plano técnico inicial

1. **Caminho preferido:** port-forward no roteador do Bruno (onde o PC dedicado vive) +
   DNS dinâmico (DDNS), já que é a rede que ele controla — do lado do amigo, só precisa de
   um endereço pra digitar, nada extra pra instalar.
2. **Plano B:** VPN tipo Tailscale/WireGuard conectando todas as máquinas numa rede
   virtual, se a NAT do Bruno ou de algum amigo impedir port-forward direto (CGNAT de
   operadora, por exemplo, é comum em conexão residencial e mata a opção 1 de cara — vale
   checar isso antes de investir na opção 1).
3. Decisão final entre as duas fica pra quando chegar nessa fase, com teste real de
   latência/conectividade nas duas pontas.

**Depende de:** #005 (o servidor de fato hospedando alguma coisa que valha a pena expor).

**Critério de sucesso:** o mesmo teste de sucesso do #005, mas com o amigo conectando de
fora da rede do Bruno.

---

## 🔧 #007 — Servidor de lobby multiplayer (sala baseada no jogo)

**Registrada em:** 10/08/2026

**A ideia:** o núcleo do multiplayer — uma sala de espera que sabe, pelo jogo escolhido,
quantos jogadores cabem (#004), deixa cada um confirmar "pronto" (com o gamepad calibrado,
ver `src/gamepad/`), atribui a porta/Multitap de cada jogador e dispara a partida no
RetroArch headless do servidor (#005), acessível pelos amigos pela internet (#006).

### Plano técnico inicial

1. Servidor Node + WebSocket (ou Rust, a decidir na hora — Node é mais rápido de prototipar
   pra essa camada, mas dá pra reavaliar) rodando junto com o RetroArch headless no PC
   dedicado.
2. Fluxo: criar sala (escolhe o jogo → lobby consulta #004 pro máximo de jogadores) →
   compartilha link/código de convite → sala de espera com status de pronto/gamepad de cada
   um → ao completar prontidão dentro do limite do jogo, atribui porta/Multitap → dispara
   `launch_emulator` no servidor em modo host apontando pro core certo.
3. Cada cliente (Bruno e amigos) conecta no host via RetroArch nativo assim que a partida
   é anunciada como pronta.

**Depende de:** #003, #004, #005 e #006 — é a última peça, a que amarra tudo.

---

## ✅ #002 — Banco de dados interno de metadata de jogos (biblioteca indexada)

**Implementada em:** 10/08/2026 — `get_system_configs`/`save_system_configs`/`reindex_library`/
`list_library` em `src-tauri/src/library.rs` + `db.rs` (SQLite via `rusqlite`, schema
`system_configs`/`games`). Cada console tem sua própria pasta de roms configurável (menu
novo `SystemSelector.tsx`), então a ambiguidade de zip que motivava `system_for_zip` deixou
de existir — a varredura não abre mais `.zip` pra adivinhar sistema. Capas via
`libretro-thumbnails` (adendo abaixo) ainda não implementadas — `cover_path` existe no
schema mas não é preenchido ainda.

**Registrada em:** 10/08/2026

**A ideia:** em vez de escanear a pasta de roms toda vez que o app abre (ler diretório
inteiro, abrir cada `.zip` pra descobrir o sistema por dentro), ter um **índice local**
com as informações já processadas — nome, sistema, tamanho, capa (quando existir). A lista
que aparece na UI vem desse índice, instantaneamente. O arquivo da rom em si só é tocado
de verdade na hora de clicar em "Jogar".

**Por que faz sentido:** o `scan_roms` atual faz trabalho pesado toda vez — percorre a
árvore de diretórios inteira e abre cada `.zip` pra espiar o conteúdo (ver `scanner.rs`).
Pra uma coleção pequena isso é rápido, mas cresce proporcional ao tamanho da biblioteca.
Separar "indexar" (caro, roda raramente) de "listar" (barato, roda toda vez que abre o
app) é a arquitetura correta assim que a coleção crescer.

### Plano técnico inicial

1. **Escolha de storage:** SQLite via a crate `rusqlite` — é "banco de dados" de verdade
   (como você pediu), suporta queries simples (filtrar por sistema, buscar por nome) sem
   reinventar nada, e é um arquivo único (`~/.local/share/emu-launcher/library.db`), sem
   precisar de servidor de banco rodando. Alternativa mais simples (menos capaz) seria só
   um JSON cacheado — mas SQLite já entrega índice/busca de graça e vale o investimento.
2. **Schema inicial:**
   ```sql
   CREATE TABLE games (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     system TEXT NOT NULL,
     rom_path TEXT NOT NULL UNIQUE,
     extension TEXT NOT NULL,
     size_bytes INTEGER NOT NULL,
     cover_path TEXT,           -- preenchido quando tivermos scraper de capa
     last_indexed_at TEXT NOT NULL
   );
   ```
3. **Novos comandos Rust:**
   - `reindex_library(base_path)` — roda a varredura pesada atual (o que hoje é
     `scan_roms`) e grava/atualiza os resultados no SQLite. Chamado explicitamente pelo
     usuário (botão "Reindexar biblioteca"), não toda vez que o app abre.
   - `list_library()` — só lê do SQLite, instantâneo, é o que a UI chama no lugar do
     `scan_roms` atual pra popular a lista.
4. **`launch_emulator` não muda** — ele já só recebe `rom_path` e dispara o processo na
   hora; a rom em si nunca é "carregada" pelo nosso código antes disso, só o RetroArch
   acessa o arquivo de fato. Ou seja, essa parte do comportamento que você quer **já é
   assim hoje** — a mudança é só sobre quando a metadata é calculada, não sobre acesso à
   rom em si.
5. **UI:** troca a chamada de `scan_roms` no `handleScan` do `App.tsx` por `list_library`
   no carregamento inicial do app, e o botão "Escanear pasta" vira "Reindexar biblioteca"
   (chamando `reindex_library`) — mais claro sobre o que cada ação custa.

**Prioridade sugerida:** dá pra fazer relativamente cedo — não depende de nada do
multiplayer, e melhora a experiência mesmo no modo local hoje. Boa candidata pra vir logo
depois de plugar o módulo de gamepad no `App.tsx`.

### Adendo — de onde vêm as capas (10/08/2026)

Fonte escolhida: **`libretro-thumbnails`**, o repositório oficial mantido pela comunidade
libretro, servido também via `thumbnails.libretro.com`. Vantagens sobre ScreenScraper/IGDB
pra esse projeto: zero cadastro/API key, e a nomenclatura já é a mesma que o RetroArch usa
(convenção No-Intro) — testado manualmente via Online Updater > Thumbnails Updater do
próprio RetroArch e confirmado que bate com as roms do Bruno.

Plano de integração:
- `reindex_library` (ver acima) tenta buscar `thumbnails.libretro.com/{sistema}/Named_Boxarts/{nome}.png`
  pra cada jogo indexado, salva localmente em cache (ex: `~/.cache/emu-launcher/covers/`) e
  grava o caminho local no campo `cover_path` do SQLite
- Nome do jogo precisa bater exatamente com a convenção No-Intro — se não bater, fica sem
  capa (fallback pro monograma tipográfico que já existe no `GameList`/`GameDetailPanel`),
  sem quebrar nada
- ScreenScraper fica como opção futura só se quisermos metadata mais rica (descrição,
  múltiplas capas por região, vídeo) — não necessário pro objetivo atual (só capa)

---

## Como consultar esse arquivo

Sempre que quiser saber "eu já registrei aquela ideia de tal coisa?", é só perguntar pra
mim ou abrir esse arquivo direto. Quando uma ideia vira trabalho de verdade, ela sai daqui
e entra na seção "Próximos passos" do `CLAUDE.md` — esse arquivo é o backlog bruto, o
`CLAUDE.md` é o que está de fato planejado pra acontecer.
