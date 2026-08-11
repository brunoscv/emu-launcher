import { useEffect, useRef, useState } from "react";
import { saveLayout } from "./storage";
import { KEY_CODE_TO_RETROARCH, RESERVED_HOTKEYS } from "./retroarchKeyNames";
import type { KeyboardMapping } from "./types";
import { CALIBRATION_ORDER, BUTTON_LABELS, type RetroPadButton } from "../gamepad/types";

interface Props {
  player: 1 | 2;
  onComplete: () => void;
  onCancel: () => void;
}

/**
 * Mesma mecânica do `GamepadCalibration` (aperta cada botão, um de cada
 * vez), só que capturando `KeyboardEvent` em vez de `Gamepad.buttons` — é
 * a alternativa à tela de input do próprio RetroArch, considerada confusa
 * (IDEAS.md #009). Bloqueia teclas que colidem com hotkeys globais do
 * RetroArch ou que já foram usadas nesse mesmo mapeamento — foi
 * exatamente esse tipo de colisão que causou o bug do "avanço aleatório"
 * durante os testes de multiplayer de hoje.
 */
export function KeyboardCalibration({ player, onComplete, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [mapping, setMapping] = useState<KeyboardMapping>({});
  const [warning, setWarning] = useState<string | null>(null);
  const mappingRef = useRef(mapping);
  mappingRef.current = mapping;

  const currentButton: RetroPadButton | undefined = CALIBRATION_ORDER[step];

  useEffect(() => {
    if (!currentButton) return; // calibração terminou
    const button = currentButton; // narrowed pra dentro do closure abaixo

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      const retroKey = KEY_CODE_TO_RETROARCH[e.code];

      if (!retroKey) {
        setWarning(`Tecla "${e.code}" não é suportada — tenta outra.`);
        return;
      }
      if (RESERVED_HOTKEYS.has(retroKey)) {
        setWarning(`Essa tecla já é um atalho global do RetroArch (ex: avançar rápido, salvar estado) — escolha outra.`);
        return;
      }
      if (Object.values(mappingRef.current).includes(retroKey)) {
        setWarning(`Você já usou essa tecla pra outro botão nesse mapeamento.`);
        return;
      }

      setWarning(null);
      setMapping((prev) => ({ ...prev, [button]: retroKey }));
      setStep((s) => s + 1);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentButton]);

  function handleSkip() {
    setWarning(null);
    setStep((s) => s + 1);
  }

  function handleFinish() {
    saveLayout({ player, mapping, configuredAt: new Date().toISOString() });
    onComplete();
  }

  return (
    <div className="keyboard-calibration">
      {!currentButton ? (
        <>
          <h2 className="keyboard-calibration__title">Mapeamento concluído!</h2>
          <p className="keyboard-calibration__hint">
            {Object.keys(mapping).length} botões configurados pro Player {player}.
          </p>
          <div className="keyboard-calibration__actions">
            <button className="btn-scan" onClick={handleFinish}>
              Salvar
            </button>
            <button className="keyboard-calibration__cancel" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="keyboard-calibration__title">Configurando teclado — Player {player}</h2>
          <p className="keyboard-calibration__hint">
            Passo {step + 1} de {CALIBRATION_ORDER.length}
          </p>
          <p className="keyboard-calibration__prompt">
            Aperte a tecla pra: <strong>{BUTTON_LABELS[currentButton]}</strong>
          </p>
          {warning && <p className="keyboard-calibration__warning">{warning}</p>}
          <div className="keyboard-calibration__actions">
            <button className="keyboard-calibration__cancel" onClick={handleSkip}>
              Pular este botão
            </button>
            <button className="keyboard-calibration__cancel" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </>
      )}

      <style>{`
        .keyboard-calibration {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          padding: 2rem;
          text-align: center;
        }

        .keyboard-calibration__title {
          font-family: var(--font-display);
          font-size: 1.1rem;
          color: var(--ink-primary);
          margin: 0;
        }

        .keyboard-calibration__hint {
          color: var(--ink-muted);
          font-size: 0.85rem;
          margin: 0;
        }

        .keyboard-calibration__prompt {
          font-size: 1.2rem;
          color: var(--ink-primary);
          margin: 1rem 0;
        }

        .keyboard-calibration__warning {
          color: var(--danger);
          font-size: 0.85rem;
          max-width: 360px;
        }

        .keyboard-calibration__actions {
          display: flex;
          gap: 0.6rem;
          margin-top: 1rem;
        }

        .keyboard-calibration__cancel {
          background: transparent;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-muted);
          padding: 0.5rem 0.9rem;
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}
