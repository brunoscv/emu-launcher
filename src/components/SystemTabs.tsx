import { systemColor, systemLabel } from "./systemMeta";

interface Props {
  systems: string[]; // ids únicos, ex: ["snes", "nes"]
  counts: Record<string, number>;
  active: string | null;
  onSelect: (system: string) => void;
}

export function SystemTabs({ systems, counts, active, onSelect }: Props) {
  if (systems.length === 0) return null;

  return (
    <nav className="system-tabs" aria-label="Sistemas">
      {systems.map((system) => {
        const isActive = system === active;
        return (
          <button
            key={system}
            className="system-tab"
            data-active={isActive}
            style={{ "--tint": systemColor(system) } as React.CSSProperties}
            onClick={() => onSelect(system)}
            aria-pressed={isActive}
          >
            <span className="system-tab__dot" />
            <span className="system-tab__label">{systemLabel(system)}</span>
            <span className="system-tab__count">{counts[system] ?? 0}</span>
          </button>
        );
      })}

      <style>{`
        .system-tabs {
          display: flex;
          gap: 0.25rem;
          padding: 0 1.5rem;
          border-bottom: 1px solid var(--border-soft);
          overflow-x: auto;
        }

        .system-tab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          padding: 0.85rem 0.75rem;
          color: var(--ink-muted);
          font-family: var(--font-body);
          font-weight: 600;
          font-size: 0.85rem;
          white-space: nowrap;
          transition: color var(--transition-fast), border-color var(--transition-fast);
        }

        .system-tab:hover {
          color: var(--ink-primary);
        }

        .system-tab[data-active="true"] {
          color: var(--ink-primary);
          border-bottom-color: var(--tint, var(--accent-phosphor));
        }

        .system-tab__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--tint, var(--accent-phosphor));
          box-shadow: 0 0 8px var(--tint, var(--accent-phosphor));
        }

        .system-tab__count {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--ink-faint);
          background: var(--bg-panel);
          padding: 0.1rem 0.4rem;
          border-radius: 999px;
        }
      `}</style>
    </nav>
  );
}
