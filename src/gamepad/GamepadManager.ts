import { RetroPadButton, type GamepadProfile, type GamepadState } from "./types";
import { getProfile } from "./storage";

const DEFAULT_DEADZONE = 0.15;

/** Aplica deadzone a um eixo analógico (evita "drift" perto do centro). */
function applyDeadzone(value: number, deadzone: number): number {
  return Math.abs(value) < deadzone ? 0 : value;
}

/**
 * Traduz o gamepad.buttons[] bruto pro vocabulário RetroPad usando o
 * mapeamento calibrado. Controles SEM perfil calibrado ainda funcionam
 * de forma degradada usando o mapping "standard" do browser quando
 * disponível — mas o objetivo é sempre ter um profile salvo (ver
 * GamepadCalibration.tsx), que é o que resolve o caso de controles
 * exóticos tipo o Razer que não tinha mapping padrão nenhum.
 */
function translateGamepad(raw: Gamepad, profile: GamepadProfile | null): GamepadState {
  const pressed = new Set<RetroPadButton>();
  const mapping = profile?.mapping ?? {};
  const deadzone = profile?.axisDeadzone ?? DEFAULT_DEADZONE;

  for (const [button, index] of Object.entries(mapping) as [RetroPadButton, number][]) {
    if (raw.buttons[index]?.pressed) {
      pressed.add(button);
    }
  }

  return {
    deviceId: raw.id,
    connected: raw.connected,
    pressed,
    leftStick: {
      x: applyDeadzone(raw.axes[0] ?? 0, deadzone),
      y: applyDeadzone(raw.axes[1] ?? 0, deadzone),
    },
    rightStick: {
      x: applyDeadzone(raw.axes[2] ?? 0, deadzone),
      y: applyDeadzone(raw.axes[3] ?? 0, deadzone),
    },
  };
}

type StateListener = (states: GamepadState[]) => void;

/**
 * Gerencia o loop de polling (a Gamepad API não dispara evento contínuo
 * de "botão apertado" — é preciso ler o estado a cada frame). Um único
 * GamepadManager serve pro app inteiro; assine via `subscribe`.
 */
export class GamepadManager {
  private rafId: number | null = null;
  private listeners = new Set<StateListener>();
  private lastStates: GamepadState[] = [];

  start(): void {
    if (this.rafId !== null) return; // já rodando
    const loop = () => {
      this.poll();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Estado bruto do índice N, útil na tela de calibração (sem tradução). */
  getRawGamepad(index: number): Gamepad | null {
    return navigator.getGamepads()[index] ?? null;
  }

  private poll(): void {
    const pads = navigator.getGamepads();
    const states: GamepadState[] = [];

    for (const pad of pads) {
      if (!pad) continue;
      const profile = getProfile(pad.id);
      states.push(translateGamepad(pad, profile));
    }

    this.lastStates = states;
    this.listeners.forEach((fn) => fn(states));
  }
}

/** Instância única compartilhada pelo app — importe isso, não crie outra. */
export const gamepadManager = new GamepadManager();
