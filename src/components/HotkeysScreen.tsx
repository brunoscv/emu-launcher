import { RESERVED_HOTKEYS } from "../keyboard/retroarchKeyNames";
import { listLayouts } from "../keyboard/storage";
import { BUTTON_LABELS } from "../gamepad/types";

interface Props {
  onClose: () => void;
}

/**
 * Referência somente-leitura das hotkeys globais de fábrica do RetroArch
 * (IDEAS.md #009) — pensada pro "poxa, apertei a tecla de salvar estado e
 * não funcionou" (porque ela foi reaproveitada num mapeamento de jogador
 * em `KeyboardCalibration.tsx`, que permite isso com aviso, não bloqueia).
 * Cruza com os mapeamentos salvos pra avisar quando isso já aconteceu.
 */
export function HotkeysScreen({ onClose }: Props) {
  const layouts = listLayouts();

  function overriddenBy(key: string): string | null {
    for (const layout of layouts) {
      for (const [button, mappedKey] of Object.entries(layout.mapping)) {
        if (mappedKey === key) {
          return `Player ${layout.player} · ${BUTTON_LABELS[button as keyof typeof BUTTON_LABELS]}`;
        }
      }
    }
    return null;
  }

  return (
    <div className="hotkeys-screen">
      <div className="hotkeys-screen__header">
        <h2>Hotkeys do RetroArch</h2>
        <button className="hotkeys-screen__close" onClick={onClose}>
          Voltar
        </button>
      </div>

      <p className="hotkeys-screen__hint">
        Essas teclas são atalhos globais de fábrica do RetroArch (não dependem de nenhum
        jogo aberto). Se você configurou o teclado de algum jogador em "⌨ Teclado" e uma
        dessas teclas parou de funcionar como atalho, é porque ela foi reaproveitada pra um
        botão de jogador — a linha fica marcada abaixo.
      </p>

      <table className="hotkeys-screen__table">
        <thead>
          <tr>
            <th>Tecla</th>
            <th>Ação</th>
            <th>Sobrescrita?</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(RESERVED_HOTKEYS).map(([key, action]) => {
            const override = overriddenBy(key);
            return (
              <tr key={key} data-overridden={override !== null}>
                <td className="hotkeys-screen__key">{key.toUpperCase()}</td>
                <td>{action}</td>
                <td className="hotkeys-screen__override">
                  {override ? `⚠ ${override}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <style>{`
        .hotkeys-screen {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          overflow-y: auto;
        }

        .hotkeys-screen__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }

        .hotkeys-screen__header h2 {
          font-family: var(--font-display);
          font-size: 1rem;
          color: var(--ink-primary);
          margin: 0;
        }

        .hotkeys-screen__close {
          background: transparent;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-muted);
          padding: 0.4rem 0.8rem;
          font-size: 0.8rem;
        }

        .hotkeys-screen__hint {
          color: var(--ink-muted);
          font-size: 0.85rem;
          max-width: 640px;
          margin: 0 0 1rem;
        }

        .hotkeys-screen__table {
          border-collapse: collapse;
          width: 100%;
          max-width: 640px;
          font-size: 0.85rem;
        }

        .hotkeys-screen__table th {
          text-align: left;
          color: var(--ink-muted);
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid var(--border-soft);
        }

        .hotkeys-screen__table td {
          padding: 0.55rem 0.75rem;
          border-bottom: 1px solid var(--border-soft);
          color: var(--ink-primary);
        }

        .hotkeys-screen__key {
          font-family: var(--font-mono);
          font-weight: 600;
        }

        .hotkeys-screen__table tr[data-overridden="true"] {
          background: color-mix(in srgb, var(--danger) 10%, var(--bg-void));
        }

        .hotkeys-screen__override {
          color: var(--danger);
          font-size: 0.8rem;
        }
      `}</style>
    </div>
  );
}
