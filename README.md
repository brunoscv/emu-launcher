# Emu Launcher — esqueleto Tauri v2 + React

Esqueleto inicial do projeto, já migrado de Tauri 1.5 → **Tauri v2** (viável agora que
o SO vai ser Xubuntu 24.04, sem a trava de glibc do Mint 19.3).

## O que já está pronto

- `scan_roms` (Rust) — varre pastas por extensão e devolve `RomEntry[]`
- `launch_emulator` (Rust, async) — dispara o processo do emulador e emite o evento
  `emulator-closed` quando ele termina, sem bloquear a UI
- `list_systems` (Rust) — mapeamento sistema → emulador (por enquanto hardcoded em
  `systems.rs`; trocar por `systems.json` editável na fase de settings)
- Grid React básico consumindo os três comandos acima, com tratamento de erro simples
- **Módulo de gamepad completo** (`src/gamepad/`) — resolve o problema de controles não
  reconhecidos (ex: Razer que não funcionava no retrogames.cc):
  - `GamepadManager.ts` — loop de polling via `requestAnimationFrame`
  - `GamepadCalibration.tsx` — tela que pede pra apertar cada botão e captura o índice físico
  - `GamepadSettings.tsx` — lista controles conectados, mostra se já tem perfil calibrado
  - `storage.ts` — persiste o mapeamento por `gamepad.id` (localStorage por enquanto)
  - Funciona idêntico no modo web e dentro do Tauri, porque ambos rodam a mesma Gamepad API
    do browser (Tauri usa WebView por baixo)
  - **Ainda não está plugado no `App.tsx`** — importe `GamepadSettings` de `src/gamepad`
    numa aba/rota de configurações quando for integrar

## O que falta (próximos passos do plano)

- [ ] Plugar `GamepadSettings` numa tela de configurações do App.tsx
- [ ] Tela de configurações geral (pastas de rom, caminho dos emuladores/cores)
- [ ] Metadata de jogos (capa/descrição) — ver seção 2.3 do plano de desenvolvimento
- [ ] Ícones do app em `src-tauri/icons/` (rode `npm run tauri icon caminho/para/logo.png`
      pra gerar todos os tamanhos — sem isso o `tauri build` falha)
- [ ] Modo web com EmulatorJS (cores libretro em WASM) — ver seção 0.1 do plano
- [ ] Módulo de netplay (`src-tauri/src/netplay/`, dependências comentadas no `Cargo.toml`)
- [ ] Signaling server (projeto Node separado, fora deste repo)

## Setup (depois de trocar pro Xubuntu 24.04)

```bash
# dependências do sistema
sudo apt update && sudo apt install -y \
  build-essential libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev pkg-config

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node 18+ via nvm
nvm install 18 && nvm alias default 18

# projeto
npm install
npm run tauri dev
```

## Notas de migração 1.5 → 2

- `invoke` agora vem de `@tauri-apps/api/core`, não mais de `@tauri-apps/api/tauri`
- Allowlist do v1 (`tauri.conf.json > tauri > allowlist`) foi substituída pelo sistema
  de **capabilities** (`src-tauri/capabilities/default.json`)
- Como `launch_emulator` roda o `Command::spawn` inteiramente em Rust (dentro do
  comando `#[tauri::command]`), **não precisamos do plugin `shell`** nem da permissão
  `shell:allow-execute` — mais simples e mais seguro do que expor shell-execute pro
  JS do frontend, como estava no plano original com a feature `shell-execute` do v1
- `tauri.conf.json` mudou de schema: `devPath`/`distDir` viraram `devUrl`/`frontendDist`,
  e a seção `tauri` foi renomeada para `app`
