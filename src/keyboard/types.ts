import { RetroPadButton } from "../gamepad/types";

/** Mapeamento calibrado de UM jogador: RetroPadButton -> nome de tecla do RetroArch. */
export type KeyboardMapping = Partial<Record<RetroPadButton, string>>;

export interface KeyboardLayout {
  player: 1 | 2;
  mapping: KeyboardMapping;
  configuredAt: string; // ISO date
}

/** RetroPadButton -> sufixo usado nas chaves `input_player{N}_{sufixo}` do
 * RetroArch (ver `keyboard_config.rs`, que só escreve o arquivo — a
 * tradução do vocabulário RetroPad fica aqui). */
export const BUTTON_TO_SUFFIX: Record<RetroPadButton, string> = {
  [RetroPadButton.A]: "a",
  [RetroPadButton.B]: "b",
  [RetroPadButton.X]: "x",
  [RetroPadButton.Y]: "y",
  [RetroPadButton.L]: "l",
  [RetroPadButton.R]: "r",
  [RetroPadButton.L2]: "l2",
  [RetroPadButton.R2]: "r2",
  [RetroPadButton.L3]: "l3",
  [RetroPadButton.R3]: "r3",
  [RetroPadButton.Select]: "select",
  [RetroPadButton.Start]: "start",
  [RetroPadButton.DPadUp]: "up",
  [RetroPadButton.DPadDown]: "down",
  [RetroPadButton.DPadLeft]: "left",
  [RetroPadButton.DPadRight]: "right",
};
