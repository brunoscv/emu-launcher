import { useState } from "react";
import { KeyboardCalibration } from "../keyboard/KeyboardCalibration";
import { deleteLayout, getLayout } from "../keyboard/storage";

interface Props {
  onClose: () => void;
}

/**
 * Tela "Configurar teclado" (IDEAS.md #009) — Player 1 e Player 2 pro
 * teclado compartilhado, alternativa ao menu de input do próprio
 * RetroArch. Sem controle nenhum configurado aqui, o RetroArch usa o
 * mapeamento padrão dele (setas/Z/X pro Player 1, Player 2 sem tecla
 * nenhuma) — configurar aqui é opcional.
 */
export function KeyboardSettings({ onClose }: Props) {
  const [calibratingPlayer, setCalibratingPlayer] = useState<1 | 2 | null>(null);
  const [version, setVersion] = useState(0); // força re-render após salvar/limpar

  if (calibratingPlayer !== null) {
    return (
      <KeyboardCalibration
        player={calibratingPlayer}
        onComplete={() => {
          setCalibratingPlayer(null);
          setVersion((v) => v + 1);
        }}
        onCancel={() => setCalibratingPlayer(null)}
      />
    );
  }

  return (
    <div className="keyboard-settings" key={version}>
      <div className="keyboard-settings__header">
        <h2>Configurar teclado</h2>
        <button className="keyboard-settings__close" onClick={onClose}>
          Voltar
        </button>
      </div>

      <p className="keyboard-settings__hint">
        Configura as teclas de cada jogador nessa máquina (útil pra testar 2 jogadores num
        teclado só, ou trocar o padrão do RetroArch por algo mais confortável). Sem
        configuração nenhuma, o RetroArch usa o padrão dele.
      </p>

      <div className="keyboard-settings__list">
        {([1, 2] as const).map((player) => {
          const layout = getLayout(player);
          return (
            <div key={player} className="keyboard-settings__row">
              <div>
                <strong>Player {player}</strong>
                <p className="keyboard-settings__status">
                  {layout ? `✅ Configurado (${Object.keys(layout.mapping).length} botões)` : "Padrão do RetroArch"}
                </p>
              </div>
              <div className="keyboard-settings__row-actions">
                <button className="btn-scan" onClick={() => setCalibratingPlayer(player)}>
                  {layout ? "Reconfigurar" : "Configurar"}
                </button>
                {layout && (
                  <button
                    className="keyboard-settings__reset"
                    onClick={() => {
                      deleteLayout(player);
                      setVersion((v) => v + 1);
                    }}
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .keyboard-settings {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          overflow-y: auto;
        }

        .keyboard-settings__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }

        .keyboard-settings__header h2 {
          font-family: var(--font-display);
          font-size: 1rem;
          color: var(--ink-primary);
          margin: 0;
        }

        .keyboard-settings__close {
          background: transparent;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-muted);
          padding: 0.4rem 0.8rem;
          font-size: 0.8rem;
        }

        .keyboard-settings__hint {
          color: var(--ink-muted);
          font-size: 0.85rem;
          max-width: 560px;
        }

        .keyboard-settings__list {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          margin-top: 1rem;
        }

        .keyboard-settings__row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
        }

        .keyboard-settings__row strong {
          color: var(--ink-primary);
          font-size: 0.9rem;
        }

        .keyboard-settings__status {
          margin: 0.2rem 0 0;
          font-size: 0.8rem;
          color: var(--ink-muted);
        }

        .keyboard-settings__row-actions {
          display: flex;
          gap: 0.5rem;
        }

        .keyboard-settings__reset {
          background: transparent;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--danger);
          padding: 0.5rem 0.8rem;
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}
