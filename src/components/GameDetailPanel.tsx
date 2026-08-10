import type { RomEntry } from "../types/rom";
import { systemColor, systemLabel } from "./systemMeta";

interface Props {
  rom: RomEntry | null;
  running: boolean;
  error: string | null;
  onPlay: (rom: RomEntry) => void;
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * Ainda não temos metadata real (capa/descrição via ScreenScraper — ver
 * `get_rom_metadata` no plano de desenvolvimento). Em vez de fingir uma
 * imagem que não existe, a "capa" aqui é um monograma tipográfico com a
 * cor do sistema — honesto sobre o que é, e já coerente visualmente com
 * o resto do tema. Trocar por <img> real quando o scraper existir.
 */
export function GameDetailPanel({ rom, running, error, onPlay }: Props) {
  if (!rom) {
    return (
      <aside className="detail detail--empty">
        <p>Selecione um cartucho na prateleira.</p>
        <style>{detailStyles}</style>
      </aside>
    );
  }

  const tint = systemColor(rom.system);
  const initials = rom.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <aside className="detail" style={{ "--tint": tint } as React.CSSProperties}>
      <div className="detail__cover">
        <span className="detail__initials">{initials}</span>
      </div>

      <div className="detail__body">
        <p className="detail__system">{systemLabel(rom.system)}</p>
        <h2 className="detail__title">{rom.name}</h2>
        <p className="detail__meta">
          {rom.extension.toUpperCase()} · {formatSize(rom.size_bytes)}
        </p>

        {error && <p className="detail__error">{error}</p>}
        {running && <p className="detail__status">Rodando no RetroArch...</p>}

        <div className="detail__actions">
          <button
            className="btn btn--primary"
            onClick={() => onPlay(rom)}
            disabled={running}
          >
            {running ? "Em execução" : "Jogar"}
          </button>
          <button className="btn btn--ghost" disabled title="Em breve">
            Netplay
          </button>
        </div>
      </div>

      <style>{detailStyles}</style>
    </aside>
  );
}

const detailStyles = `
  .detail {
    width: 300px;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    background: var(--bg-shelf);
    border-left: 1px solid var(--border-soft);
    padding: 1.5rem;
    gap: 1.25rem;
  }

  .detail--empty {
    align-items: center;
    justify-content: center;
    color: var(--ink-muted);
    font-size: 0.9rem;
    text-align: center;
  }

  .detail__cover {
    width: 100%;
    aspect-ratio: 3 / 4;
    border-radius: var(--radius-md);
    background: linear-gradient(
      135deg,
      var(--tint) 0%,
      color-mix(in srgb, var(--tint) 40%, black) 100%
    );
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .detail__initials {
    font-family: var(--font-display);
    font-size: 3.5rem;
    color: rgba(255, 255, 255, 0.85);
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .detail__body {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .detail__system {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--tint);
    margin: 0;
  }

  .detail__title {
    font-family: var(--font-display);
    font-size: 1.3rem;
    line-height: 1.25;
    margin: 0;
    color: var(--ink-primary);
  }

  .detail__meta {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--ink-faint);
    margin: 0;
  }

  .detail__error {
    color: var(--danger);
    font-size: 0.85rem;
    margin: 0.5rem 0 0;
  }

  .detail__status {
    color: var(--accent-teal);
    font-size: 0.85rem;
    margin: 0.5rem 0 0;
  }

  .detail__actions {
    display: flex;
    gap: 0.6rem;
    margin-top: 0.75rem;
  }

  .btn {
    flex: 1;
    padding: 0.7rem 1rem;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.9rem;
    border: 1px solid transparent;
    transition: transform var(--transition-fast), opacity var(--transition-fast);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn--primary {
    background: var(--accent-phosphor);
    color: #17140f;
  }

  .btn--primary:not(:disabled):hover {
    transform: translateY(-1px);
  }

  .btn--ghost {
    background: transparent;
    border-color: var(--border-strong);
    color: var(--ink-muted);
  }
`;
