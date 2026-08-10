import { useEffect, useRef, useState } from "react";
import { gamepadManager } from "./GamepadManager";
import { saveProfile } from "./storage";
import {
  CALIBRATION_ORDER,
  BUTTON_LABELS,
  type ButtonMapping,
  type RetroPadButton,
} from "./types";

interface Props {
  gamepadIndex: number;
  onComplete: (deviceId: string) => void;
  onCancel: () => void;
}

/**
 * Fluxo: pede pra pessoa apertar cada botão do RetroPad na ordem definida
 * em CALIBRATION_ORDER. Pra cada passo, faz polling do gamepad bruto até
 * detectar QUALQUER botão pressionado que ainda não esteja no mapeamento,
 * e associa esse índice físico ao botão RetroPad da vez.
 *
 * Isso é o que resolve controles sem mapping "standard" (ex: o Razer que
 * nunca funcionou no retrogames.cc) — não dependemos de nenhuma lista de
 * compatibilidade, só do que a pessoa realmente apertou.
 */
export function GamepadCalibration({ gamepadIndex, onComplete, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [mapping, setMapping] = useState<ButtonMapping>({});
  const [deviceId, setDeviceId] = useState<string | null>(null);
  // guarda quais índices já foram atribuídos, pra não reusar o mesmo
  // botão físico pra dois botões RetroPad diferentes por acidente
  const usedIndexes = useRef(new Set<number>());

  const currentButton: RetroPadButton | undefined = CALIBRATION_ORDER[step];

  useEffect(() => {
    if (!currentButton) return; // calibração terminou

    let rafId: number;
    const checkInput = () => {
      const pad = gamepadManager.getRawGamepad(gamepadIndex);
      if (pad) {
        setDeviceId(pad.id);

        const pressedIndex = pad.buttons.findIndex(
          (b, idx) => b.pressed && !usedIndexes.current.has(idx)
        );

        if (pressedIndex !== -1) {
          usedIndexes.current.add(pressedIndex);
          setMapping((prev) => ({ ...prev, [currentButton]: pressedIndex }));
          setStep((s) => s + 1);
          return; // não agenda o próximo frame, o effect vai re-rodar por causa do setStep
        }
      }
      rafId = requestAnimationFrame(checkInput);
    };

    rafId = requestAnimationFrame(checkInput);
    return () => cancelAnimationFrame(rafId);
  }, [currentButton, gamepadIndex]);

  function handleSkip() {
    // alguns controles não têm L3/R3 físico, por exemplo — permite pular
    setStep((s) => s + 1);
  }

  function handleFinish() {
    if (!deviceId) return;
    saveProfile({
      deviceId,
      mapping,
      axisDeadzone: 0.15,
      calibratedAt: new Date().toISOString(),
    });
    onComplete(deviceId);
  }

  if (!currentButton) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h2>Calibração concluída!</h2>
        <p>{Object.keys(mapping).length} botões mapeados.</p>
        <button onClick={handleFinish}>Salvar perfil</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h2>Calibrando controle</h2>
      <p style={{ opacity: 0.7 }}>
        Passo {step + 1} de {CALIBRATION_ORDER.length}
      </p>
      <p style={{ fontSize: "1.5rem", margin: "2rem 0" }}>
        Aperte: <strong>{BUTTON_LABELS[currentButton]}</strong>
      </p>
      {!deviceId && (
        <p style={{ color: "orange" }}>
          Aguardando controle responder... aperte qualquer botão pra ativar.
        </p>
      )}
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
        <button onClick={handleSkip}>Pular este botão</button>
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
