import { invoke } from "@tauri-apps/api/core";
import { listLayouts } from "./storage";
import { BUTTON_TO_SUFFIX } from "./types";

/**
 * Monta os args extras (`["--appendconfig", caminho]`) pra anexar no
 * `launch_emulator`: teclado customizado por jogador (IDEAS.md #009), se
 * algum estiver configurado, e/ou o `netplay_request_device` (IDEAS.md
 * #009, fix 11/08/2026) quando `deviceNumber` é passado — obrigatório em
 * partidas multiplayer, senão o auto-assign do netplay dá o slot 1 pro
 * host headless (ninguém nele) e o cliente vira slot 2 sem ninguém saber.
 * Sem teclado configurado E sem `deviceNumber` (uso solo, "Jogar"),
 * devolve `[]` — RetroArch usa tudo padrão, sem mudança de comportamento.
 */
export async function buildKeyboardAppendConfigArgs(deviceNumber?: number): Promise<string[]> {
  const layouts = listLayouts();
  if (layouts.length === 0 && deviceNumber === undefined) return [];

  const players = layouts.map((layout) => ({
    player: layout.player,
    mapping: Object.fromEntries(
      Object.entries(layout.mapping).map(([button, key]) => [
        BUTTON_TO_SUFFIX[button as keyof typeof BUTTON_TO_SUFFIX],
        key,
      ])
    ),
  }));

  const path = await invoke<string>("write_keyboard_config", {
    players,
    deviceNumber: deviceNumber ?? null,
  });
  return ["--appendconfig", path];
}
