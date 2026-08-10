/**
 * Botões no vocabulário do RetroPad (padrão libretro), independente
 * de qual índice físico o dispositivo usa. É pra ISSO que o índice
 * do gamepad.buttons[] será mapeado durante a calibração.
 */
export enum RetroPadButton {
  B = "B",
  A = "A",
  Y = "Y",
  X = "X",
  L = "L",
  R = "R",
  L2 = "L2",
  R2 = "R2",
  L3 = "L3",
  R3 = "R3",
  Select = "Select",
  Start = "Start",
  DPadUp = "DPadUp",
  DPadDown = "DPadDown",
  DPadLeft = "DPadLeft",
  DPadRight = "DPadRight",
}

/** Ordem em que pedimos pra pessoa apertar os botões durante a calibração. */
export const CALIBRATION_ORDER: RetroPadButton[] = [
  RetroPadButton.A,
  RetroPadButton.B,
  RetroPadButton.X,
  RetroPadButton.Y,
  RetroPadButton.L,
  RetroPadButton.R,
  RetroPadButton.L2,
  RetroPadButton.R2,
  RetroPadButton.Select,
  RetroPadButton.Start,
  RetroPadButton.DPadUp,
  RetroPadButton.DPadDown,
  RetroPadButton.DPadLeft,
  RetroPadButton.DPadRight,
  RetroPadButton.L3,
  RetroPadButton.R3,
];

/** Nomes amigáveis pra mostrar na tela de calibração. */
export const BUTTON_LABELS: Record<RetroPadButton, string> = {
  [RetroPadButton.A]: "A (confirmar)",
  [RetroPadButton.B]: "B (voltar)",
  [RetroPadButton.X]: "X",
  [RetroPadButton.Y]: "Y",
  [RetroPadButton.L]: "L / LB",
  [RetroPadButton.R]: "R / RB",
  [RetroPadButton.L2]: "L2 / LT",
  [RetroPadButton.R2]: "R2 / RT",
  [RetroPadButton.L3]: "L3 (clique do analógico esquerdo)",
  [RetroPadButton.R3]: "R3 (clique do analógico direito)",
  [RetroPadButton.Select]: "Select",
  [RetroPadButton.Start]: "Start",
  [RetroPadButton.DPadUp]: "D-Pad Cima",
  [RetroPadButton.DPadDown]: "D-Pad Baixo",
  [RetroPadButton.DPadLeft]: "D-Pad Esquerda",
  [RetroPadButton.DPadRight]: "D-Pad Direita",
};

/**
 * Mapeamento calibrado de UM controle físico: RetroPadButton -> índice
 * em gamepad.buttons[]. Persistido por gamepad.id (ver storage.ts).
 */
export type ButtonMapping = Partial<Record<RetroPadButton, number>>;

export interface GamepadProfile {
  /** gamepad.id bruto, ex: "Razer Wolverine V2 (Vendor: 1532 Product: 0a29)" */
  deviceId: string;
  /** apelido opcional pra exibir na UI, ex: "Controle do Bruno" */
  label?: string;
  mapping: ButtonMapping;
  /** deadzone dos eixos analógicos, 0.0–1.0 */
  axisDeadzone: number;
  calibratedAt: string; // ISO date
}

/** Estado "lido agora" de um controle, já traduzido pro vocabulário RetroPad. */
export interface GamepadState {
  deviceId: string;
  connected: boolean;
  pressed: Set<RetroPadButton>;
  /** eixos analógicos já com deadzone aplicada, -1.0 a 1.0 */
  leftStick: { x: number; y: number };
  rightStick: { x: number; y: number };
}
