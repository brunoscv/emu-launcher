import { useEffect, useState } from "react";
import { systemColor, systemLabel, systemYear } from "./systemMeta";

interface Props {
  systemIds: string[];
  counts: Record<string, number>;
  onSelect: (systemId: string) => void;
}

const WINDOW_SIZE = 5;

/**
 * Tela inicial, estilo carrossel de frontend retro (Batocera/EmulationStation)
 * — fileira de consoles com o ativo em destaque no centro, vizinhos visíveis
 * mas apagados dos lados (janela fixa de no máximo 5 cards, nunca a lista
 * inteira — mantém o DOM pequeno mesmo com muitos sistemas). Foto de fundo
 * (opcional, ver public/consoles/README.md) só no card central; os vizinhos
 * ficam só na cor de identidade do sistema — mais barato de renderizar e
 * ajuda a diferenciar visualmente quem está em foco.
 */
export function ConsoleCarousel({ systemIds, counts, onSelect }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState<Record<string, boolean>>({});
  const total = systemIds.length;

  function go(delta: number) {
    setActiveIndex((i) => (i + delta + total) % total);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "Enter") onSelect(systemIds[activeIndex]);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, systemIds, total]);

  if (total === 0) return null;

  const current = systemIds[activeIndex];
  const year = systemYear(current);
  const gameCount = counts[current] ?? 0;

  const windowSize = Math.min(WINDOW_SIZE, total);
  const half = Math.floor(windowSize / 2);
  const visibleIndices = Array.from(
    { length: windowSize },
    (_, i) => ((activeIndex - half + i) % total + total) % total
  );

  return (
    <div className="console-carousel">
      <header className="console-carousel__header">
        <span className="console-carousel__brand">Emu Launcher</span>
        <span className="console-carousel__hint-badge">Escolha o sistema</span>
      </header>

      <div className="console-carousel__stage">
        <button
          className="console-carousel__arrow console-carousel__arrow--left"
          onClick={() => go(-1)}
          aria-label="Console anterior"
        >
          ◀
        </button>

        <div className="console-carousel__row">
          {visibleIndices.map((index) => {
            const id = systemIds[index];
            const isCenter = index === activeIndex;
            const hasPhoto = isCenter && !imageFailed[id];
            const tint = systemColor(id);
            return (
              <div
                key={id}
                className="console-carousel__card"
                data-center={isCenter}
                onClick={() => (isCenter ? onSelect(id) : setActiveIndex(index))}
                style={isCenter ? { borderColor: tint } : undefined}
              >
                {hasPhoto ? (
                  <img
                    className="console-carousel__photo"
                    src={`/consoles/${id}.jpg`}
                    alt=""
                    onError={() => setImageFailed((prev) => ({ ...prev, [id]: true }))}
                  />
                ) : (
                  <div className="console-carousel__card-fill" style={{ background: tint }} />
                )}
                <div className="console-carousel__card-scrim" />
                <span className="console-carousel__card-label">{systemLabel(id)}</span>
              </div>
            );
          })}
        </div>

        <button
          className="console-carousel__arrow console-carousel__arrow--right"
          onClick={() => go(1)}
          aria-label="Próximo console"
        >
          ▶
        </button>
      </div>

      <p className="console-carousel__summary">
        {systemLabel(current)} —{" "}
        <strong>{gameCount === 0 ? "0 jogos" : `${gameCount} jogo${gameCount === 1 ? "" : "s"}`}</strong>
        {year !== null && ` · Lançado em ${year}`}
      </p>

      <footer className="console-carousel__footer">
        <span className="console-carousel__key">
          <span className="console-carousel__key-badge">↵</span> Entrar
        </span>
        <span className="console-carousel__key">
          <span className="console-carousel__key-badge">◀▶</span> Navegar
        </span>
      </footer>

      <style>{`
        .console-carousel {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          padding: 1.25rem 1.5rem;
          overflow: hidden;
        }

        .console-carousel__header {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding-bottom: 0.85rem;
          border-bottom: 1px solid var(--border-soft);
        }

        .console-carousel__brand {
          font-family: var(--font-display);
          font-size: 1.1rem;
          letter-spacing: 0.04em;
          color: var(--accent-phosphor);
          text-transform: uppercase;
        }

        .console-carousel__hint-badge {
          background: var(--bg-panel);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          padding: 0.25rem 0.65rem;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-muted);
        }

        .console-carousel__stage {
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          position: relative;
        }

        .console-carousel__arrow {
          flex: 0 0 auto;
          background: var(--bg-panel);
          color: var(--ink-primary);
          border: 1px solid var(--border-soft);
          border-radius: 999px;
          width: 2.75rem;
          height: 2.75rem;
          font-size: 1rem;
          cursor: pointer;
        }

        .console-carousel__row {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1.25rem;
          height: 14rem;
        }

        .console-carousel__card {
          position: relative;
          flex: 0 0 auto;
          width: 13rem;
          height: 8rem;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-soft);
          overflow: hidden;
          cursor: pointer;
          opacity: 0.45;
          transform: scale(0.88);
          /* só transform+opacity — barato de repintar mesmo sem GPU real */
          transition: transform var(--transition-fast), opacity var(--transition-fast);
        }

        .console-carousel__card[data-center="true"] {
          opacity: 1;
          transform: scale(1.08);
          border-width: 2px;
        }

        .console-carousel__photo,
        .console-carousel__card-fill {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .console-carousel__card-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.1) 60%);
        }

        .console-carousel__card-label {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0.6rem;
          text-align: center;
          padding: 0 0.5rem;
          font-family: var(--font-display);
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: var(--ink-primary);
        }

        .console-carousel__summary {
          text-align: center;
          margin: 1rem 0 0;
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: var(--ink-muted);
        }

        .console-carousel__summary strong {
          color: var(--accent-phosphor);
        }

        .console-carousel__footer {
          display: flex;
          justify-content: center;
          gap: 1.5rem;
          padding-top: 0.85rem;
          margin-top: 0.85rem;
          border-top: 1px solid var(--border-soft);
        }

        .console-carousel__key {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--ink-muted);
        }

        .console-carousel__key-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.4rem;
          height: 1.4rem;
          padding: 0 0.3rem;
          border-radius: 999px;
          background: var(--bg-panel);
          border: 1px solid var(--border-strong);
          color: var(--ink-primary);
          font-size: 0.7rem;
        }
      `}</style>
    </div>
  );
}
