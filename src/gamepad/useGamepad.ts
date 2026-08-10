import { useEffect, useState } from "react";
import { gamepadManager } from "./GamepadManager";
import type { GamepadState } from "./types";

/**
 * Assina o loop de polling e devolve o estado atual de todos os
 * controles conectados, já traduzido pro vocabulário RetroPad.
 *
 * Uso típico:
 *   const gamepads = useGamepads();
 *   const isConfirmPressed = gamepads.some(g => g.pressed.has(RetroPadButton.A));
 */
export function useGamepads(): GamepadState[] {
  const [states, setStates] = useState<GamepadState[]>([]);

  useEffect(() => {
    gamepadManager.start();
    const unsubscribe = gamepadManager.subscribe(setStates);

    // Chrome/Firefox exigem que o usuário interaja (apertar um botão)
    // antes do gamepad aparecer em navigator.getGamepads() na primeira vez.
    const handleConnect = () => {
      /* o próprio loop já vai pegar no próximo frame */
    };
    window.addEventListener("gamepadconnected", handleConnect);

    return () => {
      unsubscribe();
      window.removeEventListener("gamepadconnected", handleConnect);
      // não chama gamepadManager.stop() aqui: outro componente pode
      // estar usando o hook ao mesmo tempo. Se quiser parar de vez,
      // faça isso explicitamente no nível do App.
    };
  }, []);

  return states;
}
