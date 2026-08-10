import type { RomEntry } from "../types/rom";
import { systemColor } from "./systemMeta";

interface Props {
  roms: RomEntry[];
  selectedPath: string | null;
  onSelect: (rom: RomEntry) => void;
  loading?: boolean;
}

/**
 * Cada rom vira uma "lombada" vertical, como um cartucho numa prateleira
 * física — cor pelo sistema de origem, nome em texto vertical (igual a
 * lombada de um cartucho real). Ao selecionar, a lombada ativa "puxa pra
 * frente" (translateY + brilho), e o painel de detalhe (GameDetailPanel)
 * mostra o resto. É o elemento assinatura do design: navegar essa lista
 * deve parecer folhear uma prateleira, não rolar um grid de pôsteres.
 */
export function CartridgeShelf({ roms, selectedPath, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="shelf-status">
        <span className="spinner" style={{ color: "var(--accent-phosphor)", width: "1.4em", height: "1.4em" }} />
        <p className="shelf-status__title">Escaneando pasta...</p>
        <style>{shelfStatusStyles}</style>
      </div>
    );
  }

  if (roms.length === 0) {
    return (
      <div className="shelf-status">
        <p className="shelf-status__title">Prateleira vazia</p>
        <p className="shelf-status__hint">
          Escaneie uma pasta com roms pra preencher a prateleira.
        </p>
        <style>{shelfStatusStyles}</style>
      </div>
    );
  }

  return (
    <div className="shelf" role="listbox" aria-label="Cartuchos">
      {roms.map((rom) => {
        const isSelected = rom.path === selectedPath;
        return (
          <button
            key={rom.path}
            role="option"
            aria-selected={isSelected}
            className="cartridge"
            data-selected={isSelected}
            style={{ "--tint": systemColor(rom.system) } as React.CSSProperties}
            onClick={() => onSelect(rom)}
            title={rom.name}
          >
            <span className="cartridge__label">{rom.name}</span>
          </button>
        );
      })}

      <style>{`
        .shelf {
          display: flex;
          gap: 0.4rem;
          padding: 1.5rem;
          overflow-x: auto;
          align-items: flex-end;
          background: linear-gradient(
            to bottom,
            transparent 0%,
            transparent calc(100% - 2px),
            var(--border-soft) calc(100% - 2px)
          );
        }

        .cartridge {
          flex: 0 0 auto;
          width: 34px;
          height: 150px;
          background: linear-gradient(
            180deg,
            var(--tint) 0%,
            color-mix(in srgb, var(--tint) 60%, black) 100%
          );
          border: 1px solid rgba(0, 0, 0, 0.35);
          border-radius: var(--radius-sm) var(--radius-sm) 2px 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.6rem 0;
          box-shadow: inset -2px 0 4px rgba(0, 0, 0, 0.3);
          transition: transform var(--transition-medium), box-shadow var(--transition-medium);
        }

        .cartridge:hover {
          transform: translateY(-8px);
        }

        .cartridge[data-selected="true"] {
          transform: translateY(-16px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45), 0 0 0 2px var(--tint),
            0 0 16px var(--tint);
        }

        .cartridge__label {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          font-family: var(--font-body);
          font-weight: 600;
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.92);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-height: 100%;
        }
      `}</style>
    </div>
  );
}

const shelfStatusStyles = `
  .shelf-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 0.6rem;
    padding: 3rem;
    text-align: center;
    color: var(--ink-muted);
  }

  .shelf-status__title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    color: var(--ink-primary);
    margin: 0;
  }

  .shelf-status__hint {
    font-size: 0.9rem;
    margin: 0;
  }
`;
