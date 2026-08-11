# Emu Launcher — Contexto do Projeto

> Este arquivo é carregado automaticamente pelo Claude Code no início de cada sessão
> quando você roda `claude` dentro da pasta do projeto. Não precisa colar isso manualmente.
>
> **Existe também um `IDEAS.md`** na raiz do projeto — é o banco de ideias registradas
> (mesmo as ainda não implementadas). Consulte lá antes de propor algo novo, pra checar se
> já foi pensado antes.

## O que é o projeto

Launcher de emuladores estilo Batocera/EmulationStation, com foco em **facilitar jogar
online com amigos** — o problema original que motivou o projeto foi o retrogames.cc nunca
reconhecer o controle USB Razer de um amigo, forçando ele a jogar de teclado.

Visão de longo prazo (não é projeto "pra ontem" — Bruno tem tempo pra fazer certo):
rodar tanto em hardware antigo (i7-3537U, 2013) quanto em máquinas novas, com netplay de
baixa latência e experiência de "clica no link e já tá jogando".

## Stack técnica

- **Backend**: Rust (edição 2021), **Tauri v2** (migrado de v1.5 — só usávamos v1.5 por
  causa da glibc antiga do Linux Mint 19.3; base atual é Xubuntu 24.04, glibc 2.39, sem
  essa limitação)
- **Frontend**: React 18 + TypeScript, Vite 5
- **Gerenciador de dependências Rust**: Cargo, com `serde`/`serde_json` pra IPC Rust↔React
- **Ambiente**: Xubuntu 24.04 (trocado do Linux Mint 19.3 por incompatibilidade de glibc),
  Node 18+ via nvm, Rust via rustup — nunca via apt (versões desatualizadas)
- **Emulação**: RetroArch nativo (instalado no sistema, disparado via `Command::spawn` do
  Rust) — decisão deliberada de **não reimplementar netcode**, e sim usar o netplay nativo
  do RetroArch (rollback-based, similar a GGPO) por trás de uma camada de UX própria

## Decisões de arquitetura já tomadas (e por quê)

1. **Netplay: usar o RetroArch nativo, não WebRTC próprio.** Avaliamos os dois caminhos.
   RetroArch já resolve sincronização de estado com rollback netcode maduro; construir
   isso do zero é projeto de meses. A camada que É nossa: lobby (link, sala de espera,
   "todos prontos", atribuição de jogador/porta do Multitap) por cima do
   host/connect do RetroArch. Confirmado tecnicamente que o retrogames.cc faz o oposto
   (EmulatorJS/WASM + WebRTC próprio, sem RetroArch) — funciona, mas é significativamente
   mais frágil (o próprio ecossistema EmulatorJS reporta desconexões aleatórias de WebRTC
   em produção). Optamos pelo caminho mais robusto.

2. **Auto-instalação do RetroArch pro convidado.** `buildbot.libretro.com` disponibiliza
   binários do RetroArch e cores individuais via download direto (sem precisar da GUI do
   Online Updater). Próximo passo planejado: no primeiro uso do app, o Rust detecta se o
   RetroArch não está instalado e baixa automaticamente a versão certa + cores necessários
   + escreve um `retroarch.cfg` pré-configurado — assim o amigo instala uma coisa só (nosso
   app), não duas etapas onde ele desiste na segunda.

3. **Multiplayer 3-4 jogadores via Multitap.** Jogos como International Superstar Soccer
   Deluxe e NBA Jam Tournament Edition suportam o SNES Multitap. O netplay do RetroArch já
   distribui portas de controle entre jogadores remotos — não precisamos construir isso.

4. **Módulo de gamepad com calibração manual.** A Gamepad API do browser só garante
   mapeamento `"standard"` pra controles que o browser reconhece (majoritariamente
   Xbox/PlayStation). Controles de terceiros (o Razer do amigo do Bruno) chegam com
   `mapping: ""` — não é falha de detecção, é falta de calibração. Resolvido com uma tela
   que pede pra apertar cada botão e persiste o mapeamento por `gamepad.id`.

5. **Arquitetura híbrida Web + Nativo** (planejada, não implementada ainda): modo nativo
   (Tauri, RetroArch de verdade, uso principal do Bruno) + modo web futuro (EmulatorJS/WASM,
   pra convidar alguém sem instalar nada — trade-off: perde o netcode maduro do RetroArch).

6. **Visão de longo prazo: servidor dedicado.** Bruno tem uma segunda máquina disponível
   (Ubuntu, i5 3ª geração, 16GB RAM, GTX 1050 Ti — a GPU tem NVENC, encoder de vídeo por
   hardware). Ideia de arquitetura futura: RetroArch headless nessa máquina, com Multitap
   ativado (multiplayer LOCAL de verdade, sem netcode necessário porque é um único estado
   de jogo), vídeo codificado via NVENC e distribuído por WebRTC (LiveKit/mediasoup) pros
   navegadores dos jogadores — resolve tanto o "zero instalação" quanto o multiplayer de
   4 jogadores de um jeito mais simples que P2P. **Projeto de longo prazo, não bloqueante.**

7. **Design visual — lista estilo biblioteca Steam.** Tentamos primeiro uma "prateleira de
   cartuchos" (lombadas verticais com gradiente e glow), mas ela pesava demais sem
   aceleração gráfica de verdade (`box-shadow` com blur e `transform` em hover são caros
   pra renderizar por software). Trocamos por uma lista leve: capa retangular de cor sólida
   por sistema (sem gradiente), separador fino entre linhas (sem sombra), botão "Jogar"
   que só aparece no hover trocando `background-color` (custo quase zero). A cor por
   sistema (identidade real do console) se manteve — só a decoração pesada saiu.

## Estrutura do projeto

```
emu-launcher/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs         # registra os commands Tauri
│   │   ├── db.rs           # conexão SQLite + schema (system_configs, games)
│   │   ├── library.rs      # get/save_system_configs, reindex_library, list_library
│   │   ├── scanner.rs      # scan_system_folder — varre a pasta de UM sistema (sem sniffing de .zip)
│   │   ├── launcher.rs     # launch_emulator — spawn assíncrono + evento de fechamento
│   │   └── systems.rs      # list_systems — mapeamento sistema→emulador (hardcoded, MVP)
│   ├── capabilities/default.json  # permissions do Tauri v2 (substituiu allowlist do v1)
│   └── tauri.conf.json
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── SystemTabs.tsx
│   │   ├── GameList.tsx          # lista estilo Steam — elemento principal da UI hoje
│   │   ├── SystemSelector.tsx    # menu "quais consoles eu emulo" + pasta de roms por console
│   │   ├── systemMeta.ts         # cor/label/catálogo de sistemas, fonte única de verdade
│   │   ├── CartridgeShelf.tsx    # DEPRECADO — versão "prateleira", pesada sem GPU
│   │   └── GameDetailPanel.tsx   # DEPRECADO — painel lateral, não usado desde a lista
│   ├── gamepad/                  # módulo completo, ainda NÃO plugado no App.tsx
│   │   ├── types.ts
│   │   ├── GamepadManager.ts     # loop de polling via requestAnimationFrame
│   │   ├── GamepadCalibration.tsx
│   │   ├── GamepadSettings.tsx
│   │   └── storage.ts            # persiste mapeamento por gamepad.id
│   └── styles/theme.css          # design tokens
```

## Estado atual — o que já funciona

- ✅ Ambiente Xubuntu 24.04 100% configurado e validado (Rust, Node 18, Claude Code)
- ✅ `launch_emulator` passando `extra_args` (core do libretro) corretamente pro RetroArch
- ✅ Pipeline completo testado ponta a ponta: configurar console → reindexar → seleção →
  RetroArch abre o jogo
- ✅ UI em lista estilo Steam (leve, sem sombra/gradiente/transform), com spinner de
  carregamento no reindex
- ✅ Índice local da biblioteca em SQLite (`~/.local/share/emu-launcher/library.db`) —
  `system_configs` (quais consoles habilitados + pasta de roms de cada um, editável no
  menu `SystemSelector.tsx`) e `games` (índice indexado via `reindex_library`, lido
  instantaneamente via `list_library` — o antigo `scan_roms`/varredura de pasta única foi
  removido, cada console agora tem sua própria pasta, sem mais sniffing de `.zip`)
- ⏳ Módulo de gamepad **construído mas não integrado** no App.tsx ainda
- ⏳ `systems.rs` só tem SNES configurado de verdade; NES/PSX ainda com paths placeholder
- ⏳ Sem metadata real de jogos (capas são monograma tipográfico, não arte real — ver
  adendo de capas do `IDEAS.md` #002, ainda não implementado)

## Próximos passos (nessa ordem de prioridade)

Trabalho de UI solo (lista, busca, paginação) está OK por ora — o foco agora é a
**arquitetura de multiplayer**, num plano faseado (branch `EMU-001`), cada fase com
critério de sucesso próprio antes de avançar pra próxima. Detalhe técnico completo de
cada fase em `IDEAS.md` #003-#007 (e #001, que amarra tudo na UI no final).

1. ✅ **Fase 1 — Instalador do RetroArch com versão fixa (Linux + Windows)** — `IDEAS.md`
   #003. Fixado em **1.22.2** (a 1.18.0 do Bruno era do apt, nunca existiu no buildbot);
   `ensure_retroarch_installed` valida do e baixa/extrai/dá permissão de execução —
   validado ao vivo no Linux (download real + AppImage rodando). Windows implementado mas
   ainda sem teste numa máquina real.
2. ✅ **Fase 2 — Metadata de "número de jogadores" por jogo** — `IDEAS.md` #004 (revisado no
   #010). Busca automática via **IGDB** (trocado de ScreenScraper — cadastro instantâneo,
   sem aprovação manual), validada com chamada real (Superstar Soccer Deluxe → 4
   jogadores, batendo com o Multitap). Credenciais em `.env` na raiz (gitignored), busca
   disparada pelo botão "👥 Buscar jogadores (IGDB)", separada do reindex normal por ser
   mais lenta (rate limit da API). **Revisão #010 (11/08/2026):** o seletor manual "👥"
   saiu da `GameList` — virou um badge somente-leitura. A tabela de override manual
   (`game_player_overrides`) continua existindo, só que sem tela: corrigir um jogo errado
   agora é editar a tabela direto no SQLite. Jogo com IGDB já verificado e sem multiplayer
   nenhum vira "1 jogador" de verdade (esconde os botões Host/Cliente, ver Fase 5).
3. ✅ **Fase 3 — Prova de conceito: RetroArch headless no PC dedicado** — `IDEAS.md` #005.
   Testado de verdade pelo Bruno (PC dedicado + notebook): conectou, jogou, ping 15ms, sem
   crash. Lição aprendida: o primeiro teste falhou por descompasso de versão porque usou
   RetroArch instalado "por fora" (não pela instalação gerenciada do app) — vira requisito
   pro #007: servidor de lobby SEMPRE chama RetroArch via `retroarch::expected_installation()`,
   nunca um binário solto do PATH/sistema, nem no host nem no cliente.
4. **Fase 4 — Acesso pela internet** — `IDEAS.md` #006. Port-forward + DDNS no roteador
   do Bruno como caminho preferido; VPN (Tailscale) como plano B.
5. ✅ **Fase 5 — Servidor de lobby multiplayer** — `IDEAS.md` #007. Cortes 5a (transporte),
   5b (protocolo de sala), 5c (dispara o RetroArch host de verdade quando a sala completa)
   e 5d (UI do cliente) **implementados e validados de ponta a ponta** — partida real
   jogada entre duas máquinas (esse PC + o notebook de teste), com "Pronto" dos dois lados
   disparando o RetroArch host de verdade. No caminho, dois bugs reais achados e
   corrigidos: `config_save_on_exit` do RetroArch vazando os drivers `null` do host
   headless de volta pro `retroarch.cfg` compartilhado (contaminava o cliente também) e uma
   tecla de jogador colidindo com uma hotkey global do RetroArch (`input_hold_fast_forward`
   — causava os "avanços" aleatórios de vídeo).

   **Revisão #008 (11/08/2026) — UX mudou de "conectar num servidor" pra "Host/Cliente por
   jogo":** a tela genérica "🎮 Multiplayer" (`MultiplayerPanel.tsx`) foi substituída por
   botões **Host**/**Cliente** direto em cada linha da `GameList` (`LobbyScreen.tsx`, novo).
   Clicar "Host" resolve sozinho pra onde conectar (`resolve_lobby_host`, `server.rs`): usa
   o servidor dedicado configurado em "⚙ Consoles" se estiver online, senão a própria
   instância desktop de quem clicou vira lobby + host embutidos (`ensure_embedded_running`,
   roda no runtime async que o Tauri já mantém — não precisa de um segundo processo). O
   modo `--server` dedicado (headless, sem GUI) continua existindo pro PC dedicado — ver
   `INSTALL.md` — mas deixou de ser pré-requisito pra jogar com um amigo.

   **Riscos em aberto (sem mudança):** Multitap (3-4 jogadores) via netplay tem uma issue
   de 2020 não confirmada na versão atual — ainda não testado com um 3º PC. Acesso pela
   internet (Fase 4) também segue pendente — tudo validado até aqui foi em LAN/localhost.
6. ✅ **Fase 6 — Modo Standalone vs. Servidor na UI** — `IDEAS.md` #001, resolvida de um
   jeito diferente do planejado originalmente: em vez de um toggle manual "Jogar sozinho"/
   "Conectar ao servidor" + badge de conexão, o #008 (Fase 5, acima) faz essa escolha
   sozinho a cada clique em "Host" (servidor dedicado se estiver online, senão modo
   embutido local) — sem nenhum estado de "modo" pra alternar na UI. "Jogar" (solo) nunca
   dependeu de rede, isso não mudou.
7. **Fase 7 — Deploy real no PC dedicado** — clonar o repo lá, rodar em modo servidor
   (headless, sem GUI), manter no ar (ex: serviço systemd).

Pendências menores, sem prioridade fixa ainda:

- Plugar `GamepadSettings` numa tela/rota de configurações do `App.tsx`
- Capas via `libretro-thumbnails` durante o `reindex_library`, preenchendo `cover_path`
  (adendo do `IDEAS.md` #002 — schema já tem a coluna, só falta o download/cache)
- Preencher `systems.rs` com NES/PSX de verdade (paths reais, não placeholder)

## Preferências de trabalho do Bruno

- Não assumir nada sem ler o código real primeiro
- Aprovação em duas etapas antes de dar commit/push (mostrar diff, esperar confirmação)
- Se a mudança tocar múltiplos arquivos, preferir explicar o que vai mudar antes de aplicar
- Comentários em código em português quando explicam decisão de arquitetura/trade-off;
  nomes de variáveis/funções em inglês (convenção do código)
