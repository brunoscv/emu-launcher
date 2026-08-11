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

## ✅ #004 — Metadata de "número de jogadores" por jogo

**Registrada em:** 10/08/2026 · **Implementada em:** 10/08/2026 (branch `EMU-001`),
override manual + busca automática via IGDB, os dois validados com chamada real.

**A ideia:** o lobby (#007) precisa saber quantos jogadores um jogo específico suporta pra
abrir a sala com o número certo de vagas (ex: Superstar Soccer Deluxe e NBA Jam Tournament
Edition = até 4 via Multitap; a maioria dos outros SNES = 2). Isso **não dá pra descobrir
lendo o core libretro** — cores expõem no máximo quantas portas de controle o *sistema*
aceita, não se aquela *ROM específica* usa as portas extras. É característica do jogo, não
do core.

### Decisão de fonte automática: IGDB (não ScreenScraper)

Pesquisei as duas, Bruno inicialmente preferiu ScreenScraper (mesmo ecossistema do
`libretro-thumbnails`), mas essa exige `devid`/`devpassword` **obrigatórios em toda
chamada** e aprovação manual via fórum deles, sem prazo — bloqueio externo real (Bruno
ainda não tinha conta nem pedido acesso). Bruno decidiu trocar pra **IGDB**: cadastro
instantâneo via Twitch Developer Console (sem aprovação manual), e um recurso
`multiplayer_modes` com campos estruturados exatos pro que precisamos: `offlinemax`,
`onlinemax`, `offlinecoopmax`, `onlinecoopmax`.

### Plano técnico (implementado)

1. **Tabela de override manual (SQLite):**
   `game_player_overrides(rom_path TEXT PRIMARY KEY, max_players INTEGER NOT NULL, uses_multitap INTEGER NOT NULL DEFAULT 0)`
   em `db.rs`. `max_players <= 2` apaga a linha (2 é o padrão assumido pra quem não está na
   tabela). UI: seletor "👥 2/3/4" discreto em cada linha da `GameList` (só fica destacado
   visualmente quando > 2).
2. **Cache do resultado automático:** `game_player_auto(rom_path TEXT PRIMARY KEY, max_players INTEGER, checked_at TEXT)`
   — sempre grava uma linha depois de consultar (mesmo quando não acha multiplayer, com
   `max_players NULL`), pra `enrich_player_counts` não reconsultar o mesmo jogo sem
   multiplayer a cada execução. Torna a busca **incremental**: só verifica jogo novo desde
   a última vez.
3. **Módulo `igdb.rs`:** OAuth client-credentials do Twitch (`fetch_token`) + consulta
   Apicalypse em `POST api.igdb.com/v4/games` com `search "<nome>"; fields
   multiplayer_modes.offlinemax,...;` (`fetch_max_players`), pegando o maior valor entre os
   campos de multiplayer (filtrando `0`/ausente, que no IGDB significa "não se aplica", não
   "zero jogadores"). Credenciais em `.env` na raiz do projeto
   (`IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`, carregado via `dotenvy` no `main.rs`,
   gitignored) — ausência do `.env` não quebra nada, só desativa a busca automática
   (override manual continua funcionando sozinho).
4. **`enrich_player_counts` é uma ação separada do `reindex_library`**, disparada pelo
   botão "👥 Buscar jogadores (IGDB)" — não pelo reindex normal, porque consultar a API pra
   milhares de jogos é lento (rate limit ~4 req/s do plano gratuito do IGDB, ~300ms de
   delay entre chamadas aqui) e não devia travar a ação de "só recarregar a lista de roms".
   Emite o evento `player-count-progress` (`{checked, total}`) pro frontend mostrar
   andamento durante a espera.
5. **Precedência:** `get_player_counts` (novo command combinado) resolve
   `COALESCE(override, automático, 2)` — override manual sempre vence.

**Validado com chamada real:** teste `#[ignore]` em `igdb.rs`
(`busca_de_verdade_o_superstar_soccer_deluxe`, `cargo test -- --ignored --nocapture`)
buscou "International Superstar Soccer Deluxe" de verdade no IGDB e recebeu `max_players:
Some(4)` — bate exatamente com o Multitap que motivou essa fase inteira.

**Depende de:** #002 (implementado) pro pipeline de reindexação onde os jogos entram na
tabela `games` (fonte do que o `enrich_player_counts` varre).

**Critério de sucesso:** ✅ atingido — a lista mostra "até 4 jogadores" pro Superstar Soccer
Deluxe tanto via override manual quanto (assim que o Bruno rodar "Buscar jogadores (IGDB)")
via detecção automática real, sem digitar isso à mão pra cada jogo da biblioteca.

---

## ✅ #005 — RetroArch headless no servidor dedicado (prova de conceito)

**Registrada em:** 10/08/2026 · **Validada em:** 10/08/2026 — testada de verdade pelo
Bruno no PC dedicado + notebook, funcionou.

**A ideia:** antes de construir o lobby (#007) em cima da suposição de que "o servidor
consegue hospedar uma partida de RetroArch sem monitor", validar isso isoladamente. Era o
maior risco técnico do plano faseado inteiro — havia inclusive um crash documentado do
RetroArch justamente na combinação driver de vídeo `null` + host de netplay
([issue #9067](https://github.com/libretro/RetroArch/issues/9067), corrigida em algum
commit posterior, sem certeza se afetava a 1.22.2).

### O que foi testado (roteiro CLI manual, fora do app — ver justificativa abaixo)

1. RetroArch 1.22.2 instalado manualmente no PC dedicado (mesmos `.7z` do buildbot),
   `video_driver`/`audio_driver = "null"` via `--appendconfig`, host com `--host --port
   55435 -L core rom`.
2. Cliente no notebook conectando com `--connect`/`-C`.
3. **Resultado:** conectou e jogou — log real mostrou `[Netplay] Você se juntou como
   jogador 2 (ping: 15 ms)`. Sem crash.

### Lição aprendida (importante pro #007)

A primeira tentativa **falhou** por descompasso de versão: o comando do lado do notebook
chamou o `retroarch` do `PATH` (a instalação via apt, 1.16/1.18), não a instalação
gerenciada pelo nosso app (1.22.2, a mesma que estava no servidor) — porque nesse teste
isolado o Bruno instalou o RetroArch "por fora", sem usar o `ensure_retroarch_installed`
do projeto. Resolvido apontando pro binário certo. **Conclusão que já vira requisito pro
#007:** o servidor de lobby SEMPRE deve chamar o RetroArch através do mesmo mecanismo
gerenciado (`retroarch.rs`), nunca um `retroarch` solto do sistema/PATH — em nenhuma das
duas pontas (cliente ou host). Foi exatamente o bug que a Fase 1 foi criada pra evitar, e
aconteceu de novo só porque esse teste específico rodou por fora do app de propósito
(pra isolar a variável "RetroArch headless funciona?" antes de integrar).

### Por que foi feito via terminal, fora do app (e o que isso significa pro #007)

Essa fase testou uma pergunta bem específica — "o RetroArch em si consegue rodar sem tela
e hospedar netplay nessa máquina?" — que é um risco do RetroArch/AppImage/driver de vídeo,
não do nosso código. Validar via terminal foi a forma mais barata de isolar essa dúvida
antes de construir um "modo servidor" inteiro no app em cima de uma suposição que podia
não funcionar. Nada se perde: o #007 vai reusar exatamente esse mesmo padrão de comando
(`--host`/`--appendconfig` com drivers null), só que disparado pelo `launcher.rs` a partir
da lógica do lobby, com o caminho do binário sempre vindo de `retroarch::expected_installation()`
— nunca hardcoded/do PATH.

**Depende de:** #003 (implementado).

**Critério de sucesso:** ✅ atingido — partida jogável no host headless, sem crash, ping
baixo (15ms, mesma rede).

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

## 🚧 #007 — Servidor de lobby multiplayer (sala baseada no jogo)

**Registrada em:** 10/08/2026 · **Corte 5a (esqueleto) implementado em:** 10/08/2026
(branch `EMU-001`).

**A ideia:** o núcleo do multiplayer — uma sala de espera que sabe, pelo jogo escolhido,
quantos jogadores cabem (#004), deixa cada um confirmar "pronto" (com o gamepad calibrado,
ver `src/gamepad/`), atribui a porta/Multitap de cada jogador e dispara a partida no
RetroArch headless do servidor (#005), acessível pelos amigos pela internet (#006).

**Decisão de arquitetura (fechada com o Bruno):** servidor de lobby é **Rust, no mesmo
projeto** (não Node separado) — reusa `db.rs`, `retroarch.rs`, `launcher.rs`, `library.rs`
direto. O "modo servidor" **pula o Tauri/GTK inteiramente** (flag `--server`): o PC
dedicado pode não ter monitor plugado, e o Tauri normal precisa de um display (X11/Wayland)
só pra inicializar a janela, mesmo escondida — em vez de depender disso (ou Xvfb) só pro
nosso app, o `main.rs` detecta a flag e nunca chama `tauri::Builder`, só sobe um loop
assíncrono Rust puro.

### Corte 5a — esqueleto de transporte (✅ implementado)

Antes de desenhar o protocolo de sala inteiro, validar que o processo consegue: 1) subir em
modo servidor sem GUI, 2) aceitar conexão WebSocket. Sem sala, sem estado, sem RetroArch
ainda — só o transporte.

- `src-tauri/src/server.rs` — `tokio-tungstenite`, `TcpListener` na porta `7777` (fixa,
  arbitrária, diferente da porta de netplay do RetroArch — 55435 — pra não confundir os
  dois protocolos). Por enquanto só ecoa `"pong"` pra `"ping"`.
- `main.rs` — checa `--server` nos argumentos antes de montar o Tauri Builder; se presente,
  cria um `tokio::runtime::Runtime` manualmente e roda `server::run()`, depois retorna sem
  nunca tocar no código do Tauri (evita o erro clássico "cannot start a runtime from within
  a runtime" de misturar o runtime do Tauri com um `#[tokio::main]` no `main()` inteiro).
- **Validado:** teste automatizado (`cargo test responde_pong_pra_ping`) sobe o servidor de
  verdade e conecta como cliente real via `tokio-tungstenite` — não tinha `websocat` nem
  `python3-websockets` na máquina de dev, então o cliente de teste também é Rust. Também
  confirmado que rodar sem a flag `--server` continua abrindo a janela normal (não quebrou
  o modo desktop).
- **Validado no PC dedicado de verdade** — Bruno confirmou que `--server` sobe certinho
  sem monitor plugado. Corte 5a fechado.

### Corte 5b — protocolo de sala (✅ implementado)

Criar sala, entrar com código, ver quem entrou, marcar "pronto" — **ainda sem** disparar o
RetroArch (isso é o próximo corte, 5c).

- `src-tauri/src/protocol.rs` — `ClientMessage` (`ListGames`, `CreateRoom`, `JoinRoom`,
  `SetReady`) e `ServerMessage` (`GamesList`, `RoomState`, `Error`), JSON sobre texto
  WebSocket (`serde` com `#[serde(tag = "type")]`).
- `src-tauri/src/lobby.rs` — estado das salas em memória (`Arc<Mutex<HashMap<String, Room>>>`,
  efêmero de propósito). `create_room`/`join_room` buscam o jogo via `library::list_library()`
  — **sempre a biblioteca do próprio servidor**, nunca a de quem está pedindo, porque é o
  servidor quem vai rodar o RetroArch host de verdade (decisão da Fase 3/#005) e precisa
  do arquivo local. Máximo de jogadores via `player_overrides::get_player_counts()` (mesma
  regra que a UI: ausência = assume 2).
- `src-tauri/src/server.rs` — cada conexão usa o padrão consolidado do próprio
  `tokio-tungstenite` pra chat/broadcast: canal `mpsc::unbounded_channel` guardado no
  `Player` da sala, drenado num `tokio::select!` junto com a leitura — quando alguém entra
  numa sala, todo mundo nela (incluindo quem acabou de entrar) recebe o `RoomState`
  atualizado pelo mesmo canal.
- **Validado:** teste automatizado (`server::tests::cria_sala_entra_e_marca_pronto`) sobe o
  servidor de verdade, conecta dois clientes reais via `tokio-tungstenite`, cria sala,
  entra, marca pronto — confirma o broadcast chegando nos dois lados em cada passo, contra
  a biblioteca SQLite real (1924 jogos de SNES já indexados), sem mock.

### Corte 5c — dispara o RetroArch host quando a sala completa (✅ implementado)

Quando a sala fica cheia (`players.len() == max_players`) e todo mundo marca pronto, o
servidor monta a config headless — `video_driver`/`audio_driver = "null"` (Fase 3/#005) +
`input_libretro_device_p2 = "257"` (Multitap do SNES, **só quando o jogo pede mais de 2
jogadores** — device id confirmado na documentação do libretro) — e dispara o RetroArch em
`--host --port 55435 --appendconfig ...`, sempre via `systems::list_systems()` (que usa
`retroarch::expected_installation()`, nunca um binário solto — lição da Fase 3). Depois
disso, `ServerMessage::MatchStarting { host_port, system, game_name }` é anunciado pra sala
inteira; cada cliente resolve seu próprio core/rom local (mesmo `systems::list_systems()`
que já usa hoje) e conecta com `--connect <ip>` — o IP já é o mesmo que usou pra falar com
o lobby.

**Refatoração que isso exigiu:** `launcher.rs` tinha `launch_emulator` como
`#[tauri::command]` recebendo um `AppHandle` (só existe no modo desktop) — extraído o
núcleo (`spawn_emulator`, sem `AppHandle`, recebe um closure `on_exit` genérico) reusado
tanto pelo command Tauri (emite evento pra UI) quanto pelo servidor (só loga).

**Validado com teste automatizado real** (`server::tests::sala_cheia_e_pronta_dispara_o_host`,
`#[ignore]`, mesmo padrão dos outros testes "de verdade" do projeto): sobe o servidor,
cria sala, dois clientes reais marcam pronto, confirma que o `MatchStarting` chega — e o
RetroArch host **realmente sobe** (log confirmado: `Map_LoROMMap` do snes9x carregando a
ROM, hospedando netplay na porta 55435). Fecha sozinho pouco depois por não ter cliente de
netplay de verdade conectando nesse teste isolado — comportamento esperado, a sessão
completa com cliente real já foi validada manualmente na Fase 3.

**Bug encontrado e corrigido depois (10/08/2026), escrevendo o `INSTALL.md`:** o disparo
do host nunca chamava `ensure_retroarch_installed` — só calculava o caminho esperado
(`retroarch::expected_installation()`, via `systems::list_systems()`), sem garantir que o
arquivo existisse. No cliente desktop isso não aparecia porque o `App.tsx` já chama
`ensure_retroarch_installed` antes de jogar; o servidor headless não tinha esse passo
equivalente, então a primeira partida real num PC dedicado limpo teria falhado. Corrigido:
`lobby::launch_host` agora é `async` e chama `retroarch::ensure_retroarch_installed()`
antes de tudo. Como isso pode levar minutos (download de ~450MB na primeira vez),
`maybe_start_match` foi separado em duas partes — uma síncrona que só decide "deve
iniciar?" (dentro do lock, rápida) e `start_match` (`pub async fn`, fora do lock, chamada
numa `tokio::spawn` separada) que faz o trabalho pesado. Segurar o `std::sync::Mutex` das
salas por minutos travaria toda e qualquer outra sala do servidor, não só a que está
iniciando — daí a separação.

### Risco em aberto: Multitap (3-4 jogadores) via netplay

Achei uma issue aberta desde 2020 no GitHub do RetroArch (#10424) relatando que o Multitap
do SNES não registra input pro 3º jogador via netplay, afetando tanto `snes9x` quanto
`bsnes`. Pode já estar corrigido (o código de netplay mudou bastante desde então — mesmo
padrão da issue de crash que não se confirmou na Fase 3), mas só um teste de verdade decide.
**Ainda não testado** — Bruno vai validar com um 3º PC (notebook Windows, também serve pra
validar o instalador em Windows pela primeira vez, pendência da Fase 1) assim que possível.
O código do 5c não muda dependendo do resultado (funciona igual pra 2 ou 4 jogadores — o
Multitap é só uma linha a mais na config); o risco é inteiramente do lado do RetroArch, não
do nosso código.

### Corte 5d — UI do lado do cliente (✅ implementado, ⏳ sem conferência visual)

Tela nova "🎮 Multiplayer" (`src/components/MultiplayerPanel.tsx`), botão no header do
`App.tsx` ao lado de "⚙ Consoles":

- `src/types/lobby.ts` — `ClientMessage`/`ServerMessage`/`PlayerView` espelhando
  `protocol.rs` (incluindo a mensagem `Joined`, adicionada durante esse corte — ver nota
  abaixo).
- `src/lobby/useLobbyClient.ts` — hook que abre um `WebSocket` cru direto do frontend (o
  webview do Tauri já suporta a API nativa do browser, não precisa passar pelo lado Rust
  pra isso).
- Fluxo: digitar IP do servidor + apelido → conecta → lista os jogos do servidor (pra
  criar sala) ou entra com código → sala de espera com status de pronto de cada jogador →
  ao receber `MatchStarting`, resolve o `system`/`game_name` na biblioteca **local** (nomes
  batem, caminhos não — cada máquina tem o arquivo em pasta diferente), garante o
  RetroArch instalado (`ensure_retroarch_installed`) e dispara `launch_emulator` com
  `--connect <ip_do_servidor> --port <host_port>` anexado aos `extra_args` normais.

**Gap de protocolo encontrado e corrigido durante esse corte:** o servidor nunca dizia ao
cliente qual `PlayerView` da sala era ele mesmo (apelido não é único, dois jogadores podem
escolher o mesmo nome) — adicionada `ServerMessage::Joined { player_id }`, mandada só pra
quem acabou de criar/entrar (não é broadcast), antes do `RoomState`. Os testes de sala
(`server::tests::*`) foram atualizados pra essa nova mensagem na sequência.

**O que foi validado:** protocolo ponta a ponta (mesmos testes Rust reais da 5b/5c, agora
cobrindo `Joined`), TypeScript compilando limpo, `vite build` empacotando sem erro.
**O que falta:** a interação de verdade na tela (clicar em conectar/criar sala/ver a sala
atualizando ao vivo) — sem ferramenta de automação de UI nativa disponível, precisa de
conferência manual do Bruno.

**Depende de:** #003, #004, #005 (implementados) e #006 (acesso pela internet, ainda não
feito — os cortes de hoje só foram testados em LAN/localhost).

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

## ✅ #008 — Host/Cliente por jogo, sem servidor dedicado sempre no ar

**Registrada em:** 11/08/2026 · **Planejada em:** 11/08/2026 · **Implementada em:**
11/08/2026 — validado ao vivo ponta a ponta nas duas máquinas (Host aqui via fallback
embutido, Cliente no notebook com IP + código, os dois marcaram pronto e a partida subiu
nos dois lados).

**Nota de arrastamento de documentação (11/08/2026):** essa mudança supera parte do que
`CLAUDE.md` (Fase 6, item "Modo Standalone vs. Servidor na UI") e `INSTALL.md` descrevem
como fluxo único (servidor dedicado sempre no ar, tela genérica "🎮 Multiplayer") — os dois
arquivos ainda não foram atualizados pra refletir o fluxo novo. Registrado aqui pra não
esquecer; atualizar quando fizer sentido parar pra revisar a documentação.

**A ideia:** trocar o fluxo atual (tela separada "🎮 Multiplayer", conectar num IP de
servidor que já precisa estar rodando `--server` em outra máquina, escolher o jogo da
biblioteca DELE) por três botões direto em cada linha da `GameList`: **Jogar** (abre local,
sem multiplayer, comportamento de hoje), **Host** (vai direto pra uma tela de lobby com
esse jogo já escolhido e um código de sala pronto pra compartilhar) e **Cliente** (vai pra
uma tela de lobby só com campo de código). Quem clica Host e quem clica Cliente marcam
"pronto" e a partida começa — sem escolher jogo em tela nenhuma, o jogo já veio da linha
que foi clicada.

**Mudança de arquitetura que isso implica:** hoje o "servidor" é o modo `--server`, um
processo à parte, sem GUI, pensado pra rodar continuamente numa máquina dedicada (ver #001
e #007) — a lista de jogos do lobby vem SEMPRE da biblioteca desse servidor. Nessa ideia
nova, quem clica "Host" faz isso a partir do **próprio app desktop normal** (não precisa
subir um segundo processo/`--server` em paralelo) — o clique dispara, dentro do mesmo
processo Tauri, tanto um lobby "de bolso" (só pra essa sala) quanto o RetroArch host
headless, na mesma máquina de quem clicou. Ninguém mais precisa deixar uma máquina dedicada
ligada 24/7 só pra testar com um amigo.

**Por que faz sentido:** o fluxo atual tem fricção — precisa de uma máquina rodando
`--server` à parte (o que motivou o teste esquisito de rodar duas instâncias na mesma
máquina, servidor e cliente, competindo por CPU, ver histórico de troubleshooting desse
dia). O fluxo host/cliente por jogo elimina esse passo: qualquer um dos dois amigos pode
"ser o servidor" da partida na hora, sem setup prévio.

**Decisão (11/08/2026, com o Bruno):** modelo híbrido com fallback automático. Ao clicar
"Host": 1) o app tenta uma conexão rápida (com timeout) no endereço do servidor dedicado
configurado; 2) se responder, delega pra ele — o servidor dedicado cria o lobby e vira o
host de verdade (fluxo de hoje, #007, sem mudança nenhuma nesse caminho); 3) se não
responder (offline), a MESMA instância desktop de quem clicou "Host" passa a fazer os dois
papéis — lobby (WebSocket, mesma lógica de `server.rs`/`lobby.rs`) **e** RetroArch host
headless — tudo dentro do processo do app já aberto, sem precisar subir uma segunda
instância/processo. O jogador local ainda joga normalmente na própria janela.

### Plano técnico inicial

1. **`server.rs` deixa de assumir que só roda via `--server`.** Hoje `run()` cria seu
   próprio `tokio::runtime::Runtime` do zero porque o modo `--server` não tem Tauri (logo
   não tem runtime async nenhum rodando ainda). Extrair a lógica de aceitar conexões
   (`TcpListener::bind` + loop + `Rooms` compartilhado) numa função que recebe/retorna algo
   chamável tanto: a) do jeito que já é hoje (`--server`, cria o runtime do zero, roda pra
   sempre) quanto b) de dentro do runtime async que o Tauri **já** mantém rodando (spawnado
   sob demanda, só quando o usuário clica "Host" e o fallback local é acionado — não como
   um listener permanente do app desktop).
2. **Novo command Tauri `check_server_online(host)`** — tenta abrir e fechar uma conexão
   WebSocket rápida (com timeout curto, tipo 1-2s) no servidor configurado. Decide qual dos
   dois caminhos do item acima seguir.
3. **Novo lugar pra guardar "meu servidor"** — hoje o IP do servidor é digitado toda vez
   (`serverHost` só existe em memória no `MultiplayerPanel`). Precisa virar uma config
   persistida (nova linha de settings, provavelmente junto de `system_configs` ou uma tabela
   nova simples `app_settings(key, value)`), editável numa tela de configurações — o botão
   "Host" não deve pedir IP toda vez.
4. **`create_room` por nome, não por path exato.** Hoje `lobby::create_room` busca a rom
   pelo `rom_path` batendo **exato** com a biblioteca do servidor — funciona hoje porque a
   lista de jogos que a UI mostra pra criar sala já VEM do servidor (mesmo path). No fluxo
   novo, quem clica "Host" está escolhendo um jogo da **própria** biblioteca local, com um
   `rom_path` que quase certamente não bate com o caminho da mesma rom no servidor dedicado
   (pastas diferentes por máquina — mesma ressalva que já existe hoje pro lado do cliente,
   ver corte 5d do #007). Servidor precisa resolver por **nome + sistema**, igual o cliente
   já faz hoje pra achar a rom local quando a partida começa.
5. **`GameList.tsx`** ganha os botões "Host"/"Cliente" ao lado de "▶ Jogar" (só aparecem se
   o jogo suportar mais de 1 jogador — ver #010). Clicar em qualquer um dos dois navega
   direto pra uma tela de Lobby nova (extraída do que já existe em `MultiplayerPanel.tsx`),
   já com o jogo resolvido — sem passar pela etapa de "conectar, listar jogos, escolher".
   "Cliente" ainda precisa de um campo de código (e, se "meu servidor" não estiver
   configurado/local, também do IP de quem está hospedando).
6. **Tela "🎮 Multiplayer" genérica (atual) é substituída** por esse fluxo — os botões por
   jogo passam a ser a única porta de entrada.

**Depende de/afeta:** #001 (modo standalone vs. servidor), #007 (servidor de lobby) — muda
o `server.rs`/`lobby.rs`/`MultiplayerPanel.tsx` dos três.

---

## ✅ #009 — Configuração de controles (teclado/gamepad) pela nossa UI, não pelo menu do RetroArch

**Registrada em:** 11/08/2026 · **Planejada em:** 11/08/2026 · **Implementada em:**
11/08/2026 (compila limpo, testes automatizados passam — calibração em si ainda sem
conferência visual do Bruno, é interação de teclado numa janela nativa).

**A ideia:** o menu de configuração de input do próprio RetroArch é considerado confuso/
difícil. Em vez de mandar o jogador configurar lá dentro, ter uma tela nossa (apertar cada
botão, um de cada vez — mesmo conceito do módulo `src/gamepad/GamepadCalibration.tsx`, que
já existe pronto pra gamepad mas nunca foi plugado no `App.tsx`) e escrever o resultado num
arquivo que o RetroArch aplica sozinho ao abrir.

**Por que faz sentido:** RetroArch já lê configuração de input de arquivo texto
(`retroarch.cfg` ou `--appendconfig`, chave=valor tipo `input_player1_a = "x"`) — nós já
usamos exatamente esse mecanismo hoje em `lobby.rs` (`write_headless_config`, pros drivers
null do host) e mexemos nele manualmente durante os testes de hoje (remapeando teclado do
Player 2 direto no `.cfg`). Automatizar isso pela nossa UI é extensão natural de um
mecanismo que já existe e já foi validado na prática, só que hoje é feito à mão.

**Escopo inicial (conforme pedido):** teclado primeiro, não gamepad — o módulo de gamepad
já resolve calibração de controle fisico; falta o equivalente pra teclado, que hoje não
tem tela nenhuma (foi tudo feito hoje editando o `.cfg` direto por mim).

### Plano técnico (implementado)

1. **`src/keyboard/` (novo módulo, espelha `src/gamepad/`):** `types.ts` (reusa
   `RetroPadButton`/`BUTTON_LABELS`/`CALIBRATION_ORDER` do gamepad, adiciona
   `BUTTON_TO_SUFFIX` pra traduzir pro nome de chave do `retroarch.cfg`),
   `retroarchKeyNames.ts` (`KEY_CODE_TO_RETROARCH` — tradução de `KeyboardEvent.code` pra
   nome de tecla do RetroArch — e `RESERVED_HOTKEYS`), `storage.ts` (localStorage por
   número de jogador, 1 ou 2, mesmo padrão do `gamepad/storage.ts`), `KeyboardCalibration.tsx`
   (mesma mecânica de apertar botão-por-botão do `GamepadCalibration.tsx`, capturando
   `KeyboardEvent`), `appendConfig.ts` (monta os args `--appendconfig` na hora de lançar).
2. **`KeyboardSettings.tsx`** (novo) — tela "⌨ Teclado" no header, lista Player 1/Player 2
   com status configurado/padrão, botão calibrar/limpar.
3. **`keyboard_config.rs`** (novo, Rust) — command `write_keyboard_config` recebe o
   mapeamento já traduzido (feito no TS) e só escreve o arquivo
   `~/.local/share/emu-launcher/keyboard_session.cfg` — mesmo padrão do
   `lobby.rs::write_headless_config`. Chamado em `App.tsx::handlePlay` e
   `LobbyScreen.tsx::handleMatchStarting`, sempre; sem nenhum jogador configurado devolve
   `[]` e não muda nada do comportamento padrão do RetroArch.
4. **Proteção contra colisão com hotkey global, aplicada de verdade:** `RESERVED_HOTKEYS`
   bloqueia na hora de apertar a tecla (mensagem de aviso, não deixa avançar o passo) —
   é exatamente o tipo de bug que causou o "avanço aleatório" do Player 2 durante os
   testes de multiplayer de hoje (tecla "L" ao mesmo tempo botão A do jogador e hotkey
   `input_hold_fast_forward`). Também bloqueia reusar a mesma tecla duas vezes dentro do
   mesmo mapeamento.

**Limitação conhecida:** `RESERVED_HOTKEYS` é uma lista fixa dos hotkeys padrão de fábrica
do RetroArch 1.22.2 (a versão que `ensure_retroarch_installed` sempre instala) — se algum
dia o Bruno mudar os hotkeys manualmente pelo menu do próprio RetroArch, essa lista fica
desatualizada (não lê o `retroarch.cfg` de verdade pra conferir). Não crítico agora — a
instalação é sempre gerenciada e ninguém mexeu nos hotkeys nativos.

**Depende de:** nada bloqueante — pode ser feito independente do #008.

---

## ✅ #010 — Número de jogadores como metadado puro + validação no lobby

**Registrada em:** 11/08/2026 · **Planejada em:** 11/08/2026 · **Implementada em:**
11/08/2026

**A ideia:** o seletor "👥 2/3/4" que hoje aparece editável em cada linha da `GameList`
(#004, já implementado) deveria virar só um **badge informativo** (ícone + número máximo),
alimentado automaticamente pela consulta à API (IGDB, já integrada) — não uma caixa de
seleção manual em destaque. No lobby, se alguém tentar entrar numa sala além do máximo de
jogadores daquele jogo (incluindo jogos de 1 jogador só, que não deveriam nem oferecer
"Host" multiplayer), o servidor recusa com uma mensagem clara explicando o limite daquele
jogo específico — e quando um jogador sai e libera vaga, a sala volta a aceitar entrada.

**O que já existe (#004) e não muda:** a tabela `game_player_overrides` (override manual)
e `game_player_auto` (cache do IGDB) já existem, e `join_room` já rejeita entrada além do
`max_players` calculado (mensagem genérica "sala já está cheia"). O que essa ideia pede de
novo é (a) mudar a APRESENTAÇÃO na `GameList` de seletor editável pra badge somente-leitura
baseado no dado automático, e (b) mensagens de erro mais específicas/claras no lobby sobre
POR QUE não deu pra entrar (limite do jogo, não só "sala cheia").

**Decisões (11/08/2026, com o Bruno):** override manual sai de vez da UI (sem ajuste
secundário escondido) — 100% automático via IGDB. Busca do IGDB continua botão separado
(`enrich_player_counts`, como já é hoje), não entra no `reindex_library`, por causa do
rate limit da API.

**Descoberta durante a implementação — o IGDB não sabe dizer "1 jogador":** o campo que
usamos (`multiplayer_modes`) só existe quando o jogo TEM multiplayer documentado; ausência
significa "sem dado", não "confirmado single-player" (por isso o padrão de segurança
sempre foi assumir 2). Decisão final (11/08/2026, com o Bruno): jogo **já verificado**
(existe linha em `game_player_auto`) sem nenhum dado de multiplayer vira `1` de verdade
(esconde Host/Cliente); jogo **nunca verificado** continua assumindo 2, igual antes. A
tabela `game_player_overrides` (override manual) **continua existindo** — só saiu da UI,
não do banco: se o IGDB errar pra algum jogo específico, a correção agora é editar essa
tabela direto no SQLite (`~/.local/share/emu-launcher/library.db`), sem precisar de tela
nenhuma — o app volta a respeitar isso automaticamente (`get_player_counts` continua dando
precedência ao override sobre o valor automático).

### Plano técnico (implementado)

1. **`GameList.tsx`** — troca o `<select>` "👥 2/3/4" por um `<span>` somente-leitura
   (ícone + número), lido direto de `get_player_counts`. Sem `onChange`, sem
   `onSetPlayerCount` — prop removida da árvore de componentes.
2. **`player_overrides.rs::get_player_counts`** — query muda de
   `COALESCE(override, auto, 2) WHERE > 2` pra `COALESCE(override, auto, 1) WHERE
   override.rom_path IS NOT NULL OR auto.rom_path IS NOT NULL` — agora retorna TODO jogo já
   verificado (não só quem tem mais de 2), incluindo os que resolvem pra `1`. Jogo ausente
   do resultado (nunca verificado) continua caindo no `?? 2` do frontend / `.unwrap_or(2)`
   do `max_players_for` (Rust).
3. **`lobby.rs::create_room`** — rejeita criar sala pra jogo com `max_players <= 1`
   ("não tem multiplayer"), reforçando no servidor o que a UI já esconde.
4. **`lobby.rs::join_room`** — mensagem de erro agora inclui o limite do jogo:
   `Sala "X" já está cheia — esse jogo aceita no máximo N jogador(es)`.
5. **Remove `save_player_override` do frontend/UI** — o command Rust e a tabela
   `game_player_overrides` continuam existindo de propósito (ver "Descoberta" acima), só
   sem controle nenhum no app pra chamar isso; a correção agora é editar a tabela direto no
   SQLite.
6. **Jogo de 1 jogador não oferece "Host"** (`GameList.tsx`) — já coberto pelo item 1
   (badge com `maxPlayers > 1` escondendo os botões Host/Cliente também).
7. **"Quando um jogador sai, a sala libera vaga"** — já era o comportamento de
   `lobby::remove_player` (remove da lista, `broadcast` do novo estado) — confirmado que
   continua valendo, nenhuma mudança adicional necessária.

**Depende de:** #004 (implementado, é a base disso) e #008 (implementado, botões Host/
Cliente na `GameList` que essa ideia esconde/mostra).

---

## Como consultar esse arquivo

Sempre que quiser saber "eu já registrei aquela ideia de tal coisa?", é só perguntar pra
mim ou abrir esse arquivo direto. Quando uma ideia vira trabalho de verdade, ela sai daqui
e entra na seção "Próximos passos" do `CLAUDE.md` — esse arquivo é o backlog bruto, o
`CLAUDE.md` é o que está de fato planejado pra acontecer.
