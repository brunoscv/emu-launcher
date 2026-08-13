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

**Registrada em:** 10/08/2026 · **CGNAT confirmado + Tailscale (detecção) implementado em:**
13/08/2026 (branch `EMU-001`).

**A ideia:** os amigos vão estar em casas diferentes, não na mesma rede do Bruno — então o
servidor (lobby + RetroArch headless de #005) precisa ser alcançável pela internet, não só
na LAN.

### O que foi confirmado na prática

Bruno liberou as portas 7777 (lobby) e 55435 (netplay) no roteador, mas o teste externo
(`check-host.net`) deu timeout — porta não alcançável de fora, mesmo com o app escutando
certinho em `0.0.0.0:7777` (confirmado via `ss -tlnp`, não era bug do app). Causa raiz: IP
da WAN no painel do roteador é `100.106.168.17` — dentro da faixa `100.64.0.0/10` (RFC 6598,
reservada especificamente pra CGNAT), enquanto o IP público "visível" (`201.18.109.66`, via
`ipify`/`ifconfig.me`) é o IP do NAT da operadora (Nio), compartilhado entre várias casas.
**Port-forward não funciona nesse cenário, ponto final** — não é configuração errada de
regra, é a operadora nunca entregar o tráfego pro roteador do Bruno pra começo de conversa.

Isso confirma o "Plano B" do plano original como o caminho **real** pro caso do Bruno, não
mais uma alternativa hipotética.

### Implementado

1. **`get_tailscale_ip` (Rust, `settings.rs`)** — roda `tailscale ip -4` e retorna o IP da
   tailnet (faixa `100.x.x.x`, não confundir com a faixa de CGNAT apesar de visualmente
   parecida) ou `None` se não instalado/conectado. Não tenta instalar nem rodar
   `tailscale up` sozinho — pede autenticação interativa (abre navegador), fora do alcance
   de um command Tauri chamado de dentro da UI.
2. **`InternetSettings.tsx`** — nova seção "Deu CGNAT? Usa o Tailscale": mostra o IP da
   tailnet com botão pra preencher automaticamente o campo de endereço público (mesmo campo
   que hoje serve pra IP público/DDNS — Tailscale é só mais um tipo de valor válido ali), ou
   as instruções de instalação (`curl ... | sh` + `sudo tailscale up`) se não detectado.
   Explica que o amigo também precisa Tailscale + entrar na mesma tailnet (convite por
   e-mail no painel `login.tailscale.com/admin/users`) — isso não dá pra automatizar, é
   passo manual de cada lado.
3. **Não mudou nada no lobby/`server.rs`** — o binding já era `0.0.0.0:7777` (todas as
   interfaces), então tráfego chegando pela interface virtual do Tailscale já cai direto
   nele. A única peça que faltava era descobrir/mostrar o IP certo pra UI.

**Ainda pendente:** instalar o Tailscale de fato nesta máquina (pede senha de sistema,
Bruno precisa rodar manualmente) e validar ponta a ponta com um amigo de verdade numa rede
diferente — o que existe até aqui é a detecção/UI, não um teste real de conectividade via
Tailscale ainda.

**Depende de:** #005 (o servidor de fato hospedando alguma coisa que valha a pena expor).

**Critério de sucesso:** o mesmo teste de sucesso do #005, mas com o amigo conectando de
fora da rede do Bruno, via Tailscale.

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
4. **Aviso de colisão com hotkey global, não bloqueio (revisado 11/08/2026, com o
   Bruno):** primeira versão bloqueava de vez qualquer tecla em `RESERVED_HOTKEYS` — o
   Bruno notou que isso tira opções razoáveis do usuário (ex: WASD colide com "L"=avançar
   rápido e "K"=avançar 1 frame). Virou aviso com confirmação: `KeyboardCalibration.tsx`
   mostra qual ação da hotkey seria afetada e dois botões, "Usar mesmo assim" (segue com a
   tecla escolhida) ou "Escolher outra tecla" (volta a esperar outra tecla). Mesmo padrão
   pra tecla repetida dentro do próprio mapeamento. Quem calibra decide e assume o risco —
   foi exatamente esse tipo de colisão sem aviso nenhum que causou o "avanço aleatório" do
   Player 2 durante os testes de multiplayer de hoje (tecla "L" era botão A do jogador E
   hotkey `input_hold_fast_forward` ao mesmo tempo).
5. **`HotkeysScreen.tsx` (novo, pedido do Bruno):** botão "🔑 Hotkeys" no header — tabela
   somente-leitura com todas as hotkeys de `RESERVED_HOTKEYS` e a ação de cada uma,
   cruzando com os mapeamentos salvos pra marcar quando uma hotkey foi sobrescrita por
   algum botão de jogador (o cenário que motivou o pedido: "apertei a tecla de salvar
   estado e não funcionou — porque desconfigurei ela sem saber").

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

## ✅ #011 — Reativar o host headless sem quebrar o `netplay_request_device`

**Registrada em:** 12/08/2026.

**O que aconteceu:** investigando o bug "nenhuma tecla funciona" (host e cliente,
confirmado com dois PCs reais), depois de descartar o keymap customizado (colisão real com
`RESERVED_HOTKEYS`, ver #009, mas não era a causa raiz sozinha) e processos RetroArch
órfãos segurando a porta 55435 (limpeza manual resolveu, mas expôs um gap real: o
`kill_all_spawned()` do `launcher.rs` só limpa em fechamento gracioso do app — um `AppRun`
pós-mount FUSE sobreviveu a um restart abrupto e contaminou o teste seguinte), sobrou a
causa de verdade: **`netplay_request_device_pN` (`keyboard_config.rs`) falha de forma
consistente pra quem faz o pedido explícito**, enquanto o auto-assign padrão do RetroArch
(sem pedir nada) sempre funciona. Confirmado repetidas vezes no log real
(`[Netplay] Os dispositivos de entrada solicitados não estão disponíveis`) — e o lado que
falha muda dependendo de quem está pedindo explicitamente, nunca de qual `device_number` é.

**Contorno aplicado agora (commit `e878237`):** tirado o host headless do meio.
`lobby.rs::write_headless_config` não força mais `video_driver`/`audio_driver = "null"` nem
`vrr_runloop_enable` — quem clica "Host" roda o RetroArch de verdade, com tela, e vira o
próprio host do netplay (device 1 por padrão, sem pedir nada). `LobbyScreen.tsx` não spawna
mais um segundo processo `--connect` pro próprio host se conectar nele mesmo. Cliente
conecta normal, sem `netplay_request_device_p2`. Testado de ponta a ponta com dois PCs
reais, funcionou — mas isso **desfaz o #005** (servidor dedicado sem tela).

### Causa raiz de verdade (encontrada 12/08/2026, lendo o código-fonte oficial do RetroArch)

Duas causas reais, não uma:

1. **O próprio host headless se auto-declarava "jogador".** `netplay_frontend.c` (função
   `netplay_cmd_mode`) mostra que TODO participante do netplay — servidor incluso — vira
   "player" automaticamente na subida a menos que `netplay_start_as_spectator = "true"`
   esteja no `.cfg`. Sem essa flag, o host headless caía no mesmo "auto-assign, pega a
   primeira porta livre" que os clientes sem pedido usam — e como ele sobe ANTES de
   qualquer cliente conectar, sempre vencia a corrida e ficava com o device 1 pra si (sem
   ninguém de verdade nele). Quando o jogador que clicou "Host" pedia explicitamente o
   device 1 de volta, o servidor via a porta já ocupada (por ele mesmo) e recusava —
   sempre, de forma 100% determinística, não um bug aleatório.
2. **Processos órfãos** (já registrados acima) contaminavam portas de testes anteriores,
   fazendo a recusa parecer ainda mais aleatória.

`netplay_handle_play_spectate` confirma que a recusa (`MSG_NETPLAY_CANNOT_PLAY_NOT_AVAILABLE`,
a mensagem em PT-BR "dispositivos de entrada solicitados não estão disponíveis") só acontece
quando a porta pedida JÁ está de fato ocupada — o mecanismo em si sempre funcionou como
documentado, mas o `netplay_start_as_spectator` sequer ligou pra fazer o host desistir da
porta.

### Correção final (revertido o contorno acima)

- `lobby.rs::write_headless_config` — volta `video_driver`/`audio_driver = "null"` +
  `vrr_runloop_enable`, e adiciona `netplay_start_as_spectator = "true"` (a peça que
  faltava).
- `keyboard_config.rs::write_keyboard_config` — volta a mandar `netplay_request_device_pN`
  pra TODO `device_number`, não só 1.
- `LobbyScreen.tsx` — quem clica "Host" volta a lançar seu próprio processo `--connect`
  (controla device 1 de novo, já que o host headless não fica mais com ele).
- `launcher.rs` — bônus de robustez pro processo órfão: `spawn_emulator` agora bota cada
  processo no próprio grupo (`process_group(0)`) e `kill_pid` mata o grupo inteiro
  (`-9 -pid`, `/T` no Windows), não só o PID isolado — fecha de vez o "AppRun" que
  escapava do `pkill`/`kill_all_spawned` antes.

**Pegadinha real descoberta ao validar:** as duas máquinas (servidor + notebook) precisam
rodar EXATAMENTE o mesmo código de negociação de device — se uma ficar atrasada (não deu
`git pull`+rebuild), ela pode auto-assignar a porta 1 pra si antes da outra conseguir pedir
explicitamente, e a que pediu certo fica sem dispositivo nenhum. Sintoma: um lado controla
os menus normalmente, o outro não responde a nada.

**Depende de:** #005 (estava quebrado até isso ser resolvido, agora funciona de novo) e
#009 (mecanismo do `netplay_request_device`, confirmado funcionando).

---

## ✅ #012 — Status e download do RetroArch pela tela de configurar consoles

**Registrada em:** 12/08/2026 · **Implementada em:** 12/08/2026.

**O problema:** `ensure_retroarch_installed` (download de ~450MB, RetroArch + todos os
cores num pacote só) sempre rodou silencioso, disparado só na hora de "Jogar"/"Host" — pro
usuário, clicar num jogo e a tela travar por minutos sem explicação parecia bug, não
download em andamento.

**A solução:** `SystemSelector.tsx` ("Configurar consoles") agora mostra logo no topo um
indicador único "Emulador (RetroArch): ✅ instalado" ou "⬇ não instalado" (é um instalador
só, compartilhado por todos os consoles — não tem checagem por console, seria enganoso já
que SNES/NES/PSX vêm todos no mesmo pacote). Se não estiver instalado, botão "Baixar agora"
dispara o download com barra de progresso (fases: baixando RetroArch → extraindo → baixando
cores → extraindo → pronto), via evento `retroarch-install-progress` emitido do Rust.

**Plano técnico (implementado):**
1. `retroarch.rs` — `is_retroarch_installed()` (novo, só confere se o executável existe,
   sem baixar nada) e `install_retroarch_with_progress(app: AppHandle)` (novo, mesma lógica
   de `ensure_retroarch_installed` mas emitindo progresso) — os dois compartilham a mesma
   função interna (`ensure_installed_inner`), só muda se tem `AppHandle` pra emitir evento
   ou não. `ensure_retroarch_installed` (sem progresso) continua existindo do jeito que
   sempre foi, é a rede de segurança chamada antes de "Jogar"/Host/Cliente.
2. `SystemSelector.tsx` — checa o status ao abrir a tela, escuta o evento de progresso,
   desenha a barra.

**Depende de:** #003 (é a mesma instalação gerenciada, só com uma UI melhor em cima).

---

## ✅ #013 — Carrossel de consoles + identidade visual retro (Batocera/EmulationStation)

**Registrada em:** 12/08/2026 · **Implementada em:** 12/08/2026.

**O pedido:** trocar a navegação "abas de sistema + lista única com tudo misturado" por um
fluxo em duas telas, estilo Batocera/EmulationStation/Infanto Games: primeiro um carrossel
pra escolher o console (com contagem de jogos e ano de lançamento), depois a lista de jogos
só daquele console. Junto, revisar a identidade visual (cores, tipografia) — a paleta
original ("preto quente"/âmbar) não estava agradando.

**Decisões tomadas no caminho:**
1. **Fundo do carrossel — sem foto de verdade por enquanto.** Pesquisei pacotes de tema
   EmulationStation com fotos reais de hardware consistentes entre os 7 sistemas e não achei
   nada com licença clara (os populares tipo Carbon são ícone vetorial, não foto; os com foto
   de verdade são temas "mini réplica" de UM console só). `ConsoleCarousel.tsx` lê de
   `public/consoles/<system_id>.jpg` (pasta gitignored, ver `public/consoles/README.md`) com
   fallback pra cor sólida do sistema — o Bruno preenche as fotos que quiser, no próprio
   tempo, sem bloquear o resto.
2. **Paleta nova (`theme.css`):** preto neutro (era preto quente) + vermelho retro como
   acento primário (era âmbar de CRT). `--accent-phosphor` manteve o NOME da variável (usada
   em vários componentes) só trocou de valor — renomear exigiria mexer em todo lugar que
   referencia, sem ganho real.
3. **Lista de jogos virou 3 colunas** (nomes / metadados / capa+ações) — mais fiel ao
   estilo de referência, mas é o mesmo tipo de layout do `GameDetailPanel.tsx`
   (deprecated, trocado antes por pesar sem GPU real). Mitigado: transform/sombra só no
   ITEM SELECIONADO da lista (nunca em todos ao mesmo tempo nem em hover de linha) — vale
   testar de verdade na i7-3537U antes de considerar resolvido.
4. **Sem metadata inventada.** A coluna de metadados só mostra o que o app sabe de
   verdade (sistema, tamanho do arquivo, nº de jogadores via IGDB) — não tem
   desenvolvedora/ano/nota por jogo, esse dado não existe no banco (ver `IDEAS.md` #002,
   ainda pendente).
5. **`SystemTabs.tsx` removido** (virou código morto, substituído pelo carrossel).

**Depende de:** nada bloqueante. Reabre a pergunta do `IDEAS.md` #002 (capas via
`libretro-thumbnails`) — com o carrossel e a coluna de capa maiores, capa de verdade (em vez
de monograma) rende mais visualmente do que antes.

---

## ✅ #014 — Match manual de capas por nome de arquivo (adendo do #002)

**Registrada em:** 12/08/2026 · **Implementada em:** 12/08/2026.

**O que é:** o Bruno colocou capas (fotos de caixa) numa subpasta `covers/` dentro da pasta
de roms de cada sistema (ex: `roms/snes/covers/Nome Da Rom (USA).png`) — curadoria manual
dele, não um scraper automático (isso continua sendo o `#002`, ainda pendente). O app agora
casa cada rom com a capa de mesmo nome durante o `reindex_library` e mostra a foto de
verdade na coluna de capa da `GameList` (em vez do monograma) quando encontra.

**Detalhe do match:** nome do arquivo de capa às vezes troca apóstrofo por `_`
(`Pugsley's` → `Pugsley_s`, provavelmente convenção de algum scraper que sanitiza nome de
arquivo) — `normalize_for_cover_match` (`scanner.rs`) cobre isso. Confirmado contando de
verdade: 529 das 1924 roms de SNES do Bruno bateram (as fotos que ele já tinha baixado não
cobrem a biblioteca inteira, principalmente jogos só-Japão sem capa USA).

**Como a imagem chega na tela:** `cover_path` é só um caminho de arquivo (coluna que já
existia no schema, nunca preenchida antes). O webview do Tauri não carrega caminho de
arquivo local direto num `<img src>` sem configurar escopo do asset protocol — em vez
disso, `read_cover_image` (novo command, `library.rs`) lê os bytes e devolve como data URI,
chamado sob demanda só pro jogo selecionado (não em lote no `list_library`, que incharia a
resposta com 700+ imagens de uma vez).

**Pendência que o próprio Bruno já registrou:** compactar essas capas (arquivos vieram
grandes, 690×490 sem otimização) — por ora é só teste, sem tratamento de tamanho/cache.

**Depende de:** #002 (é o adendo de capas de lá, versão manual em vez de scraper).

---

## ✅ #015 — "Iniciar mesmo assim" quando a sala não fecha o Multitap

**Registrada em:** 12/08/2026 · **Implementada em:** 12/08/2026.

**O problema:** salas só disparam a partida quando ficam CHEIAS
(`room.players.len() >= room.max_players`, `lobby.rs::maybe_start_match`). Pro ISS Deluxe
(até 4 via Multitap), testando com só 3 PCs disponíveis, todo mundo dava "Pronto" e nada
acontecia — silenciosamente esperando um 4º jogador que nunca ia chegar. Sem mensagem de
erro nem indicação nenhuma na UI do porquê.

**A solução:** `ClientMessage::ForceStart` (novo) — só quem criou a sala (`room.players[0]`)
pode mandar, só funciona com pelo menos 2 jogadores presentes e todos já prontos. Não muda
o `max_players` do jogo (continua configurando o Multitap certo no core do RetroArch,
`write_headless_config`) — só os slots extras ficam sem ninguém controlando. Botão "Iniciar
mesmo assim (3/4)" aparece em `LobbyScreen.tsx` só pra quem criou a sala, só quando a sala
não está cheia e todo mundo presente está pronto.

**Depende de:** #007 (é extensão do fluxo de sala) e #011 (é o cenário — Multitap — que
motivou perceber essa lacuna).

---

## ✅ #016 — Automatiza o contorno da libretro/RetroArch#10424 (Multitap + netplay)

**Registrada em:** 12/08/2026 · **Implementada em:** 12/08/2026.

**O problema:** testando o ISS Deluxe com 3 PCs reais (força-início do #015), o jogo nem
mostrava as opções de 3/4 jogadores — mesmo com `input_libretro_device_p2 = "257"` no
`--appendconfig` de boot do host (o que a gente já fazia desde o #005). Achada a causa:
issue **aberta desde 2020 e nunca corrigida** no repositório oficial do RetroArch
([libretro/RetroArch#10424](https://github.com/libretro/RetroArch/issues/10424)) — Multitap
simplesmente não sincroniza direito com netplay se configurado só na inicialização.

**Confirmado na prática (fora do app, direto por terminal, 3 PCs reais):** o contorno
documentado pela comunidade do próprio issue funciona — configurar o Multitap pelo Menu
Rápido → Controles → Porta 2 → Multitap, "Save Game Remap File", **fechar e recarregar o
conteúdo**, só DEPOIS disso hospedar o netplay. Capturamos o `.rmp` real gerado por esse
fluxo (`config/remaps/Snes9x/<jogo>.rmp`) pra usar como referência exata de formato.

**Automatizado agora:** `lobby.rs::write_multitap_remap` escreve esse mesmo arquivo `.rmp`
ANTES do primeiro carregamento do host (não depois, como o fluxo manual) — como o arquivo
já existe desde o início, não devia precisar do passo de "recarregar" (o recarregamento só
era necessário porque a config foi aplicada TARDE, via menu, depois do primeiro load; um
remap pré-existente já é aplicado desde a primeira carga). `write_headless_config` não seta
mais `input_libretro_device_p2` sozinho (não era suficiente sozinho, confirmado).

**Validado de ponta a ponta (12/08/2026):** testado pelo app de verdade, com os 3 PCs reais
(servidor + notebook + Windows) — a teoria se confirmou: o arquivo `.rmp` pré-existente
desde o primeiro carregamento tem o mesmo efeito do "configurar pelo menu + salvar +
recarregar" manual, sem precisar simular o recarregamento. 3 jogadores humanos controlando
o ISS Deluxe via Multitap ao mesmo tempo, funcionando.

**Depende de:** #011 (Multitap depende do host headless funcionando) e #015 (força-início,
necessário pra testar com menos gente que o máximo).

---

## ✅ #017 — Tela "Jogar pela Internet" (acesso fora da LAN, adendo do #006)

**Registrada em:** 12/08/2026 · **Implementada em:** 12/08/2026.

**O pedido:** tudo validado até aqui foi em LAN — pra jogar com amigos de verdade (casas
diferentes), o roteador de quem hospeda precisa encaminhar portas pra fora, e a pessoa
precisa saber pra qual endereço mandar o amigo conectar. Pedido explícito: instruções
completas e visíveis, nada escondido, e o endereço não pode ficar fixo no código — o
usuário escolhe o dele.

**O que foi feito:**
1. **`settings.rs`** — `get/save_public_host_address` (mesmo padrão do `dedicated_server_host`
   que já existia): endereço público/DDNS digitado pelo usuário, guardado só pra reexibir —
   a gente não descobre isso sozinho (IP público muda, hostname de DDNS não tem como
   inferir). `get_local_lan_ip` (novo) — detecta o IP local da máquina via truque de socket
   UDP "conectado" sem enviar pacote nenhum (kernel escolhe a interface, não precisa de
   internet de verdade), pra instrução saber pra qual IP apontar a regra do roteador.
2. **`InternetSettings.tsx`** (novo, botão "🌐 Jogar pela Internet" no header) — as 3 portas
   que precisam ser liberadas (TCP 7777 lobby, TCP+UDP 55435 netplay) numa tabela, passo a
   passo de painel de roteador (nome genérico da seção, já que muda por marca), o IP local
   detectado, campo pro endereço público, e avisos honestos: teste de porta aberta de fora
   da rede, CGNAT (bem comum no Brasil — quando acontece, port-forward NUNCA funciona,
   não importa a configuração, só VPN tipo Tailscale resolveria — ainda não implementado),
   e que só quem hospeda precisa fazer isso (quem só entra como cliente não mexe em nada).
3. **`LobbyScreen.tsx`** — sala de host agora reexibe o endereço público salvo lado a lado
   com o código, pronto pra copiar e mandar pro amigo. Sem endereço configurado, mostra um
   aviso softzinho em vez de simplesmente omitir a informação.

**O que fica de fora, de propósito:** a gente não abre porta sozinho (não dá, é
configuração do roteador) nem detecta o IP público automaticamente (evita uma chamada de
rede externa desnecessária, e DDNS não tem como advinhar de jeito nenhum) — o usuário
sempre digita o que ele mesmo configurou.

**Depende de:** #006 (esta é a primeira fatia implementada dele — falta ainda testar de
verdade com alguém de fora da rede, e o Plano B de VPN/CGNAT continua não implementado).

---

## ✅ #018 — Botão "Procurar..." pra pasta de roms

**Registrada em:** 12/08/2026 · **Implementada em:** 12/08/2026.

**O pedido:** o campo de pasta de roms em "⚙ Consoles" só aceitava digitar o caminho à mão
— pedido de um botão que abre o seletor de pasta nativo do SO e já preenche o campo.

**Implementado:** plugin oficial `tauri-plugin-dialog` (Rust) + `@tauri-apps/plugin-dialog`
(JS), registrado no `main.rs` e liberado em `capabilities/default.json`
(`"dialog:default"`). Botão "Procurar..." ao lado de cada input em `SystemSelector.tsx`
abre o diálogo nativo (`open({ directory: true })`) já na pasta atual configurada, se
tiver uma; cancelar o diálogo não mexe no campo.

**Depende de:** nada bloqueante.

---

## ✅ #019 — Editar número de jogadores pela UI (traz de volta o #010)

**Registrada em:** 12/08/2026 · **Implementada em:** 12/08/2026.

**O pedido:** o `#010` tinha tirado o controle manual da UI de propósito (virou badge
somente-leitura, corrigir era editar a tabela `game_player_overrides` direto no SQLite).
Bruno pediu de volta um jeito mais dinâmico — um botão na tela de jogos, editando por
enquanto só a quantidade máxima de jogadores.

**O que foi feito:**
1. **`player_overrides.rs::save_player_override`** — não descarta mais valores ≤2 (antes
   isso "resetava" o override em vez de gravar; sem esse comportamento não dava pra fixar
   "1 jogador" de propósito num jogo que o IGDB marcou errado como multiplayer). Agora
   qualquer valor 1+ vira um override explícito de verdade.
2. **`GameList.tsx`** — o valor "👥 N jogadores" na coluna de metadados ganhou um botão
   "✏️" do lado; clicar troca pra um input numérico inline (Enter salva, Esc cancela) que
   chama `save_player_override` e atualiza a lista na hora (`onPlayerCountChanged`, novo
   prop, disparado pelo `App.tsx::refreshPlayerCounts`).

**Fora do escopo de propósito (pedido do Bruno, "inicialmente"):** editar `uses_multitap`
separadamente (calculado automático como `max_players > 2` por enquanto) e qualquer outro
campo de metadata — só número de jogadores por ora.

**Depende de:** #004/#010 (é a mesma tabela/mecanismo, só trouxe UI de volta).

---

## ✅ #020 — Abrir RetroArch avulso pra mapear input pelo menu nativo dele

**Registrada em:** 12/08/2026 · **Implementada em:** 12/08/2026.

**O pedido:** receio de habilitar de novo o mapeamento de teclado próprio (#009, já colidiu
com hotkey global uma vez) — pedido de um jeito de abrir o RetroArch de verdade, sem rom e
sem nenhuma config nossa, pra configurar input pelo Menu Rápido → Controles dele mesmo,
gravando direto no `retroarch.cfg` compartilhado.

**Implementado:** `launcher::spawn_emulator` agora aceita `rom_path: Option<&str>` (era
obrigatório antes) — só bota o argumento da rom na linha de comando quando tem uma de
verdade. Novo command `open_retroarch` chama `ensure_retroarch_installed` e sobe o
executável sozinho, sem core, sem rom, sem `--appendconfig` nenhum. Botão "Abrir
RetroArch" na tela "⌨ Teclado", numa seção nova explicando a alternativa.

**Depende de:** nada bloqueante — é um caminho paralelo ao #009, não substitui.

---

## 🔧 #021 — Tailscale embutido e invisível (zero instalação visível pro amigo)

**Registrada em:** 13/08/2026 · **Rota A validada com protótipo isolado em:** 13/08/2026 (TCP
e UDP funcionando de ponta a ponta com um node `tsnet` embutido — ver detalhes abaixo).

**Contexto:** motivada pelo CGNAT confirmado no #006 (operadora Nio do Bruno) — port-forward
está descartado de vez, IP da WAN (`100.106.168.17`) cai na faixa reservada `100.64.0.0/10`
(RFC 6598). O caminho de contorno é VPN mesh (Tailscale), mas com um requisito extra que o
#006/#017 não cobria: os até 5 amigos do grupo **não podem precisar instalar nem configurar
nada por fora da nossa aplicação** — nem o Tailscale, nem criar conta nele manualmente.
Comparado com playit.gg (túnel centralizado): descartado por ter latência maior esperada
(tráfego sempre passa pelo relay deles), inviável pra netplay de SNES sensível a frame — ver
decisão no #006. Sem pressa nenhuma pra colocar isso no ar; prioridade é funcionar de
verdade, não economizar trabalho de implementação.

### Pesquisa feita (13/08/2026) — duas rotas candidatas

**Rota A — Tailscale embutido via `tsnet` (linha mais promissora):** `tsnet` é a forma da
própria Tailscale de rodar um nó completo **dentro do processo**, sem depender de serviço
do sistema nem de driver TUN — userspace puro (stack de rede gVisor rodando só dentro do
nosso binário). Isso muda o design todo: em vez de "instalar o Tailscale silenciosamente"
(que ainda pede elevação/admin no Windows por causa do driver), a gente **nunca instala
nada**, só linka a biblioteca no nosso próprio executável. Duas formas de chegar nisso em
Rust:
- `tailscale-rs` (oficial, mantido pela própria Tailscale) — mas o próprio repositório se
  descreve como "unstable and insecure", não recomendado pra produção ainda (preview).
- crate `tsnet` de `passcod/libtailscale` — wrapper Rust (FFI) em cima do `libtailscale`
  (C, esse sim mantido oficialmente pela Tailscale). Mais promissor, mas ainda `0.1.0`
  early-stage, e o build depende de ter o **toolchain Go instalado** (cross-compile
  Go→C dentro do processo de build Rust) — pesa no pipeline do GitHub Actions, mas é
  contornável (runner com Go configurado).

**Limitação real confirmada:** processos separados na mesma máquina (ex: o RetroArch, que é
um executável à parte, só recebe `spawn` nosso) **não enxergam** a rede virtual do tsnet
sozinhos — só o processo que embutiu o tsnet consegue discar/escutar nela. Isso não mata a
ideia, mas muda o desenho: nosso app vira um **proxy** — escuta na rede tsnet (porta 7777 do
lobby, 55435 TCP/UDP do netplay) e repassa pra `127.0.0.1:<porta>` onde o RetroArch local
está de verdade escutando, nos dois sentidos. O RetroArch nunca precisa saber que Tailscale
existe. UDP é suportado por `tsnet` (`tsnet.Server.ListenPacket`, confirmado na doc oficial
em Go) — mas não confirmei se o wrapper Rust (`libtailscale`) expõe esse mesmo recurso, só
TCP está certo por enquanto. **Isso precisa ser testado na prática antes de qualquer coisa.**

**Rota B — Bundle do `tailscale.exe`/`tailscaled` reais (fallback comprovado):** mesma ideia
que veio da conversa com o Gemini, só que com o comando certo — `tailscale.exe
install-system-daemon` **não existe** (conferido rodando `tailscale --help` no binário real
instalado aqui: não está na lista real de subcomandos). O caminho real e documentado é
instalar via MSI em modo silencioso: `msiexec /i tailscale-setup-X.msi /quiet /norestart` —
isso instala o WinTun (driver de rede) e registra o `tailscaled` como serviço do Windows.
**Ainda pede elevação/UAC**, mas dá pra embutir esse UAC dentro do próprio instalador do
nosso app (também MSI/WiX) — pro amigo, vira só "autoriza a instalação do jogo", sem
aparecer o nome "Tailscale" na tela. É o caminho maduro/testado em produção por outras
empresas (existem scripts de deploy corporativo prontos, ex:
`hellocharli/tailscale-unattended` no GitHub), contra a Rota A que é experimental.

### Geração automática da auth key (sem o amigo clicar em "autorizar")

Confirmado: dá pra gerar auth key **programaticamente**, sem o fluxo de navegador. Cria-se
um **OAuth client** (client ID + secret) no painel do Tailscale, com escopo `auth_keys`; um
servidor nosso troca esse client credentials por um token de curta duração e chama a API do
Tailscale pra emitir uma auth key nova (de preferência **efêmera**, `--ephemeral`, pra sair
sozinha da tailnet quando o amigo desconecta, sem acumular dispositivo fantasma). O app
então roda `tailscale up --authkey=<key> --accept-dns=false` (ou o equivalente via
`tsnet.Server` na Rota A) sem nenhuma tela de login aparecer.

**Importante:** o client secret do OAuth **não pode** ir embutido no instalador (qualquer um
descompila e rouba acesso à tailnet inteira). Precisa de um microserviço nosso guardando
esse segredo — Bruno já tem conta Vercel e domínio de programação, então dá pra ser uma
function serverless simples (Node ou equivalente) com um endpoint tipo `POST /mint-key`,
autenticado de algum jeito mínimo (nem que seja um token fixo embutido no app — bem menos
grave que vazar o client secret real, porque um token vazado só gera keys efêmeras de
convidado, não dá acesso administrativo à tailnet).

### Isolamento dos convidados (ACL/tags)

Confirmado: Tailscale tem **tags** — um dispositivo de amigo entraria com `tag:guest`, e uma
regra de ACL restringe esse tag a só alcançar `tag:host` nas portas 7777/55435, nunca outros
dispositivos pessoais do Bruno que estejam na mesma tailnet (ex: NAS, PC de trabalho). Sem
isso, todo amigo convidado teria acesso de rede a **tudo** na tailnet por padrão (Tailscale
é "permite tudo entre membros" até alguém restringir).

### Limites do plano grátis ("Personal")

Confirmado na página oficial de preços: até **6 usuários**, dispositivos de usuário
ilimitados, até **50 recursos taggeados** (`tag:host` + `tag:guest` não chega perto disso),
até **3 grupos de ACL**, e **1.000 minutos-recurso efêmero por mês** — esse último é o único
que merece atenção: se sessões com `--ephemeral` contarem contra essa cota, uso frequente ao
longo do mês pode esbarrar nela. Não confirmado se "recurso efêmero" nesse contexto de
billing é o mesmo conceito do nó efêmero pessoal — verificar com conta de teste antes de
depender disso a longo prazo.

### O que foi testado na prática (13/08/2026) — Rota A funciona

Protótipo isolado em `~/Sites/projetos/tsnet-prototype` (fora do repo principal, não
versionado), crate `tsnet` de `passcod/libtailscale`, resultados reais:

- **Build só funciona com Go 1.21.0 exato — Go 1.23 (o mais novo) quebra.** O `gvisor`
  vendorizado (dependência da Tailscale, snapshot de 2023) usa `//go:linkname` pra acessar
  símbolos internos do runtime do Go (`goready`, `gopark`, `semacquire`...) que mudaram nas
  versões mais novas. Isso é um requisito real e rígido pro pipeline: o GitHub Actions
  precisa fixar Go **1.21.x**, não "a versão mais nova disponível" — do jeito que já fixamos
  o RetroArch em `1.18.0` no #003, mesma lógica.
- **O node embutido entra na tailnet de verdade, sem instalar nada.** Rodou o binário Rust
  isolado, ele gerou uma URL de login real (`login.tailscale.com/a/...`), o Bruno autorizou
  no navegador, e o dispositivo `tsnet-prototype` apareceu no `tailscale status` da conta
  real, com IP próprio (`100.90.16.100`) — sem `apt install`, sem serviço do sistema, sem
  driver, tudo dentro do processo do nosso próprio binário.
- **TCP e UDP os dois funcionam de ponta a ponta.** Testado com `nc`/`nc -u` de outra máquina
  na mesma tailnet (o cliente Tailscale normal deste PC) contra o listener do protótipo —
  os dois ecoaram de volta corretamente. Isso desmente (na prática, pelo menos nesse teste)
  o aviso do próprio código-fonte de que "UDP currently not really tested" — funcionou, mas
  como o aviso é dos mantenedores originais, vale continuar tratando como não-garantido até
  um teste real com o netplay do RetroArch de verdade (não só um echo).
- **Reautenticação é instantânea** — o estado fica salvo (`~/.config/tsnet-<hostname>/`), e
  reiniciar o processo depois de já ter logado uma vez não pede login de novo. Bom sinal pro
  caso real, onde o app do amigo ficaria aberto e fechado repetidas vezes.
- **`netcheck` interno reportou `udp=true`, `hair=true` e conexão ao relay DERP de São Paulo
  em ~55-90ms** — isso é o teste "de casa pra casa" mais próximo que dava pra fazer sozinho
  (localhost mesmo, então não prova NAT traversal real entre duas redes CGNAT diferentes),
  mas confirma que a infraestrutura básica de rede da Tailscale está saudável a partir daqui.
- **Gap confirmado:** a API Rust (`tsnet` crate) não expõe nenhuma função de "pegar meu IP"
  ou "status" — o `tailscale.h` por baixo só tem `dial`/`listen`/`accept`/`loopback`. Pra
  mostrar o IP da tailnet na UI (como já fizemos em `get_tailscale_ip` pro caminho normal),
  vai precisar implementar isso na mão via `tailscale_loopback` (API local HTTP) — trabalho
  de engenharia real, não é `get_ip()` de graça.
- **Build musl estático (pra rodar sem risco de versão de glibc numa segunda máquina) deu
  segfault na primeira tentativa**, num notebook mais antigo (CPU Ivy Bridge ~2013, tem
  `avx` mas não `avx2` — não parece ser a causa, já que nem Go nem Rust exigem `avx2` por
  padrão). Suspeita mais forte: **linkagem estática do runtime do Go contra musl é uma
  combinação conhecida por ser frágil** (o runtime do Go tem premissas sobre threading/sinal
  que casam melhor com glibc) — a build dinâmica normal (mesma usada no teste bem-sucedido
  acima) não teve esse problema. Compilar nativamente em cada máquina (Rust+Go instalados
  ali, build dinâmico contra o glibc local) contornou o crash. **Risco real da Rota A**: se o
  plano de distribuição final depender de builds estáticas multi-plataforma, esse bug volta
  a aparecer — precisa investigar mais a fundo ou assumir que cada instalação compila/baixa
  um binário dinâmico específico pro SO+arquitetura do usuário (como já fazemos com o
  RetroArch no #003).
- **Teste entre duas redes diferentes de verdade (casa com CGNAT + hotspot de celular):
  tentado, resultado promissor mas não confiável.** Um notebook Linux (Bodhi) foi levado pro
  hotspot do celular, compilou o protótipo nativamente ali (contornando o bug do musl acima)
  e entrou na mesma tailnet. Um `tailscale ping` e testes de TCP/UDP reais (`nc`/`nc -u`)
  nesse momento retornaram sucesso com **conexão direta (sem relay DERP) via IPv6, ~9ms**.
  Isso seria uma confirmação forte — só que o Wi-Fi do notebook reconectou sozinho na rede de
  casa logo em seguida (comportamento automático do NetworkManager dele), e não dá pra
  garantir com certeza em qual rede ele estava exatamente no instante dos testes de sucesso.
  **Vale registrar também:** mesmo que o resultado se confirme, o caminho direto foi via
  IPv6 (que não passa por CGNAT, é roteável globalmente) — isso não prova necessariamente que
  duas redes **IPv4-only** atrás de CGNAT conseguiriam o mesmo furo direto; só prova que,
  quando IPv6 está disponível dos dois lados (comum em operadora residencial e móvel no
  Brasil hoje), a Tailscale prefere e consegue esse caminho mais fácil. **Repetir esse teste
  com uma conexão de internet móvel estável** é o próximo passo pendente antes de declarar a
  Rota A validada de ponta a ponta.
- **Não testado ainda:** fluxo com `--authkey` não-interativo (só confirmado que o método
  existe na API, não rodado ainda), e build pra Windows (cross-compile do Go/cgo a partir de
  um runner Linux é historicamente instável — pode forçar runner Windows nativo no GitHub
  Actions).

**Conclusão parcial (Linux):** Rota A é tecnicamente viável — não é só teoria, o node
embutido conecta e transporta TCP+UDP de verdade, inclusive (com bastante confiança, mas não
100% certeza) atravessando duas redes diferentes de fato. O bug do musl foi outro achado
importante: muda a estratégia de distribuição (compilar/baixar binário nativo por SO, não um
estático universal).

### Windows: bloqueio real encontrado (13/08/2026) — não é só risco, é estrutural

Workflow de teste isolado (`.github/workflows/test-tsnet-windows.yml`) rodado de verdade no
GitHub Actions, dois jobs (MSVC+MinGW-só-pro-Go, e GNU consistente) — **os dois falharam no
build**, mesmo erro exato nos dois:

```
tailscale.c:5:10: fatal error: sys/socket.h: No such file or directory
```

Investigando o código-fonte do `tailscale.c` (a ponte C entre o Go e o Rust dentro do
`passcod/libtailscale`): a função `tailscale_accept` (usada por `.listen()`/aceitar conexão,
que é o que a Rota A precisa tanto pro lobby quanto pro netplay) é implementada com
`recvmsg()` + `CMSG_FIRSTHDR`/`CMSG_DATA` — a técnica POSIX clássica de **passar um file
descriptor entre processos via socket** (é assim que o processo Go conversa com a camada
C/Rust por baixo). Isso **não tem equivalente direto no Windows** — não é biblioteca
faltando nem flag de compilador errada, é um mecanismo de sistema operacional que o Windows
não oferece do mesmo jeito. Não é um "patch de um include" — é uma dependência estrutural de
como a lib inteira foi desenhada.

**Importante não confundir:** isso não quer dizer que "Tailscale não roda no Windows" — a
Rota B (Tailscale de verdade instalado, que já implementamos a detecção em `settings.rs`)
funciona perfeitamente lá, é o app oficial deles, maduro, usado por milhões. O problema é
específico dessa ponte C/Rust de terceiro que a Rota A depende pra embutir — ninguém portou
essa parte pro Windows ainda.

**Opções daqui pra frente:**
1. **Híbrido por SO:** Rota A (embutido, invisível) em Linux/Mac, Rota B (Tailscale
   instalado, com aquele UAC de instalador) só no Windows — mais complexidade de manter dois
   caminhos, mas nenhum dos dois é trabalho perdido (já implementamos os dois em partes).
2. **Contribuir o suporte a Windows no `passcod/libtailscale` upstream** — trabalho real de
   C/Go, reescrever esse mecanismo de handoff pra algo que exista no Windows (ex: named
   pipes, ou duplicar o socket com `WSADuplicateSocket` em vez de `SCM_RIGHTS`). Não é
   pequeno, é contribuição de código aberto de verdade, sem prazo garantido de aceite.
3. **Investigar a alternativa 100% Rust** (`tailscale-rs`, o preview oficial da própria
   Tailscale, sem nenhum C/cgo por baixo) — pode não ter essa limitação especificamente por
   não depender dessa técnica de fd-passing, mas o próprio projeto se descreve como
   "unstable and insecure", e é uma reimplementação independente de uma stack de rede/cripto
   complexa — mais um caminho a validar do zero, não uma solução garantida.

### Plano faseado

1. ~~Protótipo isolado confirmando build + TCP/UDP básico~~ — feito, ver seção acima.
2. ~~Teste de conectividade entre duas redes diferentes (CGNAT de casa + hotspot)~~ —
   tentado, resultado promissor mas não 100% confiável (ver ressalva acima). Pendente
   repetir quando a internet móvel estiver estável.
3. ~~Build no Windows via GitHub Actions~~ — **falhou nos dois jobs**, bloqueio estrutural
   confirmado (ver seção acima), não é só "travou por falta de configuração".
4. ~~Decisão sobre o contorno pro Windows~~ — **resolvida em 13/08/2026:** Windows vira Rota
   B (Tailscale de verdade, instalado/logado pelo nosso app), Rota A fica só pro Linux
   (Bruno programando) sem prazo — ver seção "Pivô de prioridade" acima. `tailscale-rs` e
   contribuição upstream ficam descartados por ora, não bloqueando mais nada.
5. ~~ACL da tailnet~~ — **feito em 13/08/2026:** `tag:host`/`tag:guest` criadas, `grants`
   restringindo convidado a só alcançar `tag:host` nas portas 7777 TCP / 55435 TCP+UDP (o
   resto da tailnet do Bruno fica invisível pra convidado).
6. ~~Microserviço de auth key na Vercel~~ — **implementado em 13/08/2026:**
   `vercel-tailscale-keys/api/mint-key.js`, endpoint `POST /api/mint-key` protegido por
   segredo compartilhado (header `x-emu-launcher-secret`), troca o OAuth client (escopo
   `auth_keys`, restrito a `tag:guest`) por um token de curta duração e gera uma auth key
   efêmera/pré-autorizada (`expirySeconds: 300` — vive só o tempo de ser usada na hora).
   Client ID/Secret do Tailscale nunca tocam o código nem o app distribuído, só existem como
   variável de ambiente na Vercel. **Ainda não testado ponta a ponta** (depende do deploy na
   Vercel, que o Bruno está fazendo).
7. **Integrar no app Rust** — novo command tipo `join_tailnet_as_guest` que chama o endpoint
   da Vercel, pega a `key`, e roda `tailscale up --authkey=<key>` (variação do
   `start_tailscale_login` que já existe, mas sem fluxo de navegador nenhum). É esse command
   que o botão "Cliente" deveria disparar antes de tentar conectar num host — ainda não
   escrito.
8. **Integração final na UI** — reaproveita `InternetSettings.tsx`/`LobbyScreen.tsx`, mas o
   fluxo de "Cliente" passa a chamar o `join_tailnet_as_guest` sozinho, sem o amigo precisar
   nem saber que existe uma tela de Tailscale — só clica "Cliente", digita o código da sala,
   pronto.

**Depende de:** #006 (motivação e IP local/público já resolvidos) — nada bloqueante além
disso, mas é bastante trabalho novo de infraestrutura (microserviço externo, pipeline de
build com Go), não é uma tarde de trabalho como as ideias menores deste arquivo.

**Critério de sucesso:** um amigo em outra cidade, numa rede CGNAT dele também, abre nosso
instalador, clica "Jogar" numa sala que o Bruno criou, e o RetroArch conecta — sem nunca ter
ouvido a palavra "Tailscale", sem UAC de driver de rede separado da tela de instalação do
nosso próprio app, sem digitar IP nem código de convite manual de rede.

**Riscos em aberto:**
- Rota A é experimental — pode não vingar; sem o protótipo testado não tem como prometer
  prazo nem garantir que substitui a Rota B.
- Cross-compile Go dentro do pipeline Rust (Rota A) é conhecido por ser chato, especialmente
  pra Windows a partir de um runner Linux — pode forçar runner nativo Windows no GitHub
  Actions (mais lento/caro, mas disponível).
- CGNAT nos dois lados ao mesmo tempo (Bruno + amigo) pode falhar o "furo" de NAT direto do
  Tailscale e cair pro relay dele (DERP) — ainda bem melhor que nenhuma conexão, mas não é
  "quase zero lag garantido" como o resumo do Gemini deu a entender. Precisa validar com
  `tailscale status`/`tailscale netcheck` num teste real entre duas redes CGNAT antes de
  declarar sucesso.
- Cota de "minutos-recurso efêmero" do plano grátis (1.000/mês) — não confirmado se afeta
  esse uso; verificar com conta de teste antes de depender disso a longo prazo.

### Pivô de prioridade (13/08/2026) — Windows primeiro, via Rota B

Decisão do Bruno: 100% dos amigos usam Windows, e o objetivo agora é ter uma versão Windows
**estável e funcional**, não perfeita/invisível. Como a Rota A tem bloqueio estrutural real
no Windows (seção acima), o caminho pro Windows deixa de ser "esperar a Rota A resolver" e
vira **Rota B com instalação automatizada** — não é mais só fallback teórico, é o plano
principal pro Windows enquanto a Rota A fica reservada pro Linux (uso do próprio Bruno
programando) e como possível unificação futura, não bloqueante.

**Implementado (13/08/2026):**
- **`tailscale_install.rs`** (novo módulo, mesmo padrão do `retroarch.rs`) — `ensure_tailscale_installed`
  baixa o instalador oficial (`https://pkgs.tailscale.com/stable/tailscale-setup-1.102.2-amd64.msi`,
  versão fixa confirmada em 13/08/2026, mesmo espírito da versão fixa do RetroArch) e roda
  `msiexec /i ... /quiet /norestart TS_NOLAUNCH=1` **elevado** via crate `runas` (dispara o
  UAC só pra esse processo filho, não eleva o app inteiro). `TS_NOLAUNCH=1` evita o ícone da
  bandeja deles aparecer — tudo controlado via `tailscale.exe` na linha de comando a partir
  daqui, igual `get_tailscale_ip` já fazia. `is_tailscale_installed` checa o caminho
  conhecido (`%ProgramFiles%\Tailscale\tailscale.exe`) antes do PATH, porque o PATH de um
  processo já rodando não atualiza sozinho depois que um instalador roda.
- **`InternetSettings.tsx`** — botão "Instalar Tailscale automaticamente" na seção 6, com
  barra de progresso (reaproveita o mesmo padrão visual do instalador do RetroArch em
  `SystemSelector.tsx`), aparece só quando `is_tailscale_installed` volta `false`.
- Só Windows por enquanto (`require_windows()` recusa explicitamente em outro SO) — decisão
  deliberada de não tentar suportar Linux nessa função ainda, pra não gastar tempo num
  caminho que o Bruno não vai usar no curto prazo.

**Não verificado ainda (mesma ressalva que o `#003` teve antes de validar o RetroArch no
Windows):** nunca rodou numa máquina Windows real. `cargo check --target x86_64-pc-windows-gnu`
localmente esbarrou em falta do toolchain MinGW completo (mesmo problema visto no teste do
`tsnet`) — validação real depende do `build-windows.yml` (CI) ou de testar na máquina de um
amigo de verdade.

**Falta pra fechar o Windows de ponta a ponta:**
1. Validar que compila no `build-windows.yml` de verdade (diferente do `test-tsnet-windows.yml`,
   esse aqui não depende de Go/cgo — só baixa e roda um `.msi` oficial, risco bem menor).
2. Testar numa máquina Windows real: será que o UAC aparece do jeito esperado, será que
   `TS_NOLAUNCH=1` realmente evita o ícone, será que `is_tailscale_installed` detecta certo
   logo depois de instalar.
3. **Microserviço de auth key (Vercel)** — sem isso, depois de instalado o Tailscale ainda
   pede login manual (abrir navegador, entrar com conta) da primeira vez. Automatizar isso é
   o próximo passo real pra fechar "amigo só clica instalar, mais nada".

---

## Como consultar esse arquivo

Sempre que quiser saber "eu já registrei aquela ideia de tal coisa?", é só perguntar pra
mim ou abrir esse arquivo direto. Quando uma ideia vira trabalho de verdade, ela sai daqui
e entra na seção "Próximos passos" do `CLAUDE.md` — esse arquivo é o backlog bruto, o
`CLAUDE.md` é o que está de fato planejado pra acontecer.
