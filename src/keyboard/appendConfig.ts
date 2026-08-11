import { invoke } from "@tauri-apps/api/core";
import { listLayouts } from "./storage";
import { BUTTON_TO_SUFFIX } from "./types";

/**
 * Se algum jogador tiver teclado configurado (IDEAS.md #009), escreve o
 * `--appendconfig` correspondente e devolve os args extras pra anexar no
 * `launch_emulator` (`["--appendconfig", caminho]`). Sem nenhum jogador
 * configurado, devolve `[]` — o RetroArch usa o mapeamento padrão dele,
 * sem mudança nenhuma de comportamento.
 */
export async function buildKeyboardAppendConfigArgs(): Promise<string[]> {
  const layouts = listLayouts();
  if (layouts.length === 0) return [];

  const players = layouts.map((layout) => ({
    player: layout.player,
    mapping: Object.fromEntries(
      Object.entries(layout.mapping).map(([button, key]) => [
        BUTTON_TO_SUFFIX[button as keyof typeof BUTTON_TO_SUFFIX],
        key,
      ])
    ),
  }));

  const path = await invoke<string>("write_keyboard_config", { players });
  return ["--appendconfig", path];
}
