interface Props {
  letters: string[]; // ex: ["#", "A", "B", ...], só as que têm pelo menos 1 jogo
  counts: Record<string, number>;
  active: string | null;
  onSelect: (letter: string) => void;
}

/** Agrupa nomes que começam com dígito/símbolo em "#"; resto vai pela primeira letra em maiúsculo. */
export function letterGroupOf(name: string): string {
  const ch = name.trim().charAt(0).toUpperCase();
  return ch >= "A" && ch <= "Z" ? ch : "#";
}

export function AlphabetTabs({ letters, counts, active, onSelect }: Props) {
  if (letters.length === 0) return null;

  return (
    <nav className="alphabet-tabs" aria-label="Filtrar por letra">
      {letters.map((letter) => {
        const isActive = letter === active;
        return (
          <button
            key={letter}
            className="alphabet-tab"
            data-active={isActive}
            onClick={() => onSelect(letter)}
            aria-pressed={isActive}
            title={`${counts[letter] ?? 0} jogo(s)`}
          >
            {letter}
          </button>
        );
      })}

      <style>{`
        .alphabet-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 0.2rem;
          padding: 0.6rem 1.5rem;
          border-bottom: 1px solid var(--border-soft);
        }

        .alphabet-tab {
          flex: 0 0 auto;
          min-width: 1.8rem;
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          padding: 0.25rem 0.4rem;
          color: var(--ink-muted);
          font-family: var(--font-mono);
          font-weight: 600;
          font-size: 0.8rem;
        }

        .alphabet-tab:hover {
          color: var(--ink-primary);
          border-color: var(--border-soft);
        }

        .alphabet-tab[data-active="true"] {
          color: var(--bg-void);
          background: var(--accent-phosphor);
        }
      `}</style>
    </nav>
  );
}
