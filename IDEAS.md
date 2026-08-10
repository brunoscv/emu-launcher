# Banco de Ideias — Emu Launcher

> Registro de ideias que surgem durante o desenvolvimento, mesmo as que não vão ser
> implementadas já. Serve pra não perder o fio e pra consultar depois "isso aqui eu já
> pensei, tá anotado, qual o status?".

**Legenda de status:** 💡 Proposta (só a ideia, sem plano técnico) · 🔧 Planejada (tem plano
técnico, ainda não começou) · 🚧 Em andamento · ✅ Implementada · ❌ Descartada (com o motivo)

---

## 🔧 #001 — Modo Standalone vs. Modo Servidor (multiplayer)

**Registrada em:** 10/08/2026

**A ideia:** o notebook antigo (i7-3537U) fica dedicado a jogar sozinho, localmente, sem
depender de nada externo. Quando quiser jogar com os amigos, o servidor de lobby roda no
outro PC (i5 3ª geração + GTX 1050 Ti) e o notebook se **conecta** nele como cliente —
dois modos de uso do mesmo app, não dois apps diferentes.

**Por que faz sentido:** separa preocupações — o modo local nunca depende de rede/servidor
pra funcionar (resiliente, simples, rápido), e o modo multiplayer é oferecido como uma
camada opcional por cima, sem forçar complexidade em quem só quer jogar sozinho.

### Plano técnico inicial

1. **Config de conexão** — nova tela de configurações com um campo "Endereço do servidor
   de lobby" (IP:porta do PC dedicado) e um toggle "Jogar sozinho" / "Conectar ao servidor".
2. **Modo local (já existe, é o comportamento atual)** — `scan_roms`/`list_systems`
   locais, `launch_emulator` dispara RetroArch direto, sem nenhuma dependência de rede.
3. **Modo servidor** — o app abre uma conexão WebSocket com o servidor de lobby (o mesmo
   que já está no roadmap como Fase 6/7: criar sala, convidar, confirmação de "pronto",
   status do gamepad de cada jogador, atribuição de porta/Multitap). Quando a partida
   começa, o `launch_emulator` local ainda dispara o RetroArch **localmente** — o servidor
   só coordena, não roda o jogo nessa fase (isso é diferente da Ideia futura do servidor
   headless/streaming, ver decisão #6 do `CLAUDE.md` — são coisas relacionadas mas não
   a mesma implementação).
4. **Indicador de estado de conexão na UI** — algo simples tipo um badge no header
   mostrando "🟢 Conectado ao servidor" / "⚪ Modo local", pra ficar óbvio em qual modo o
   app está rodando.

**Depende de:** a Fase 6/7 do roadmap principal (servidor de lobby) já cobre boa parte da
infraestrutura de rede necessária — essa ideia é menos "código novo do zero" e mais
"formalizar que o mesmo app suporta os dois modos", uma vez que o servidor de lobby exista.

**Não depende de:** a ideia do servidor headless com NVENC/streaming (decisão #6) — aquilo
é uma evolução de arquitetura maior e mais distante; essa ideia aqui funciona com o modelo
P2P + RetroArch nativo que já é o plano atual.

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
