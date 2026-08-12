import { invoke } from "@tauri-apps/api/core";

/**
 * Monta os args extras (`["--appendconfig", caminho]`) pra anexar no
 * `launch_emulator`: só o `netplay_request_device` (IDEAS.md #009, fix
 * 11/08/2026) quando `deviceNumber` é passado — obrigatório em partidas
 * multiplayer, senão o auto-assign do netplay dá o slot 1 pro host
 * headless (ninguém nele) e o cliente vira slot 2 sem ninguém saber.
 *
 * TESTE 12/08/2026 (IDEAS.md #009, investigação do bug "nenhuma tecla
 * funciona"): upload do teclado customizado por jogador desligado de
 * propósito — o mapeamento salvo tinha 4 botões colidindo com hotkeys
 * globais do RetroArch (`RESERVED_HOTKEYS` em `retroarchKeyNames.ts`,
 * ex: Y="h" = reiniciar o jogo). Rodando só com o keymap padrão do
 * RetroArch pra isolar se a colisão era a causa raiz antes de recalibrar.
 * Reativar (voltar a ler `listLayouts()`/`BUTTON_TO_SUFFIX`) depois do teste.
 */
export async function buildKeyboardAppendConfigArgs(deviceNumber?: number): Promise<string[]> {
  if (deviceNumber === undefined) return [];

  const path = await invoke<string>("write_keyboard_config", {
    players: [],
    deviceNumber,
  });
  return ["--appendconfig", path];
}
