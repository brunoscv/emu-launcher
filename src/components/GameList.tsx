import type { RomEntry } from "../types/rom";
import { systemColor, systemLabel } from "./systemMeta";

const PLAYER_COUNT_OPTIONS = [2, 3, 4];

interface Props {
  roms: RomEntry[];
  runningPath: string | null;
  error: string | null;
  loading: boolean;
  hasEnabledSystems: boolean;
  playerCounts: Record<string, number>;
  onPlay: (rom: RomEntry) => void;
  onConfigureSystems: () => void;
  onSetPlayerCount: (rom: RomEntry, maxPlayers: number) => void;
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/**
 * Lista estilo biblioteca Steam. Trocada da "prateleira de cartuchos" original
 * por ser MUITO mais leve de renderizar: sem box-shadow com blur, sem
 * gradiente, sem transform em hover — só cor sólida e background-color no
 * hover, que WebKitGTK sem aceleração gráfica de verdade renderiza sem
 * esforço. A cor por sistema continua (fundo sólido da capa), só perdeu o
 * gradiente diagonal que tinha antes.
 */
export function GameList({
  roms,
  runningPath,
  error,
  loading,
  hasEnabledSystems,
  playerCounts,
  onPlay,
  onConfigureSystems,
  onSetPlayerCount,
}: Props) {
  return (
    <div className="game-list-wrap">
      {error && <div className="game-list__error">{error}</div>}

      {loading ? (
        <div className="game-list__status">
          <span className="spinner" style={{ color: "var(--accent-phosphor)" }} />
          <p>Reindexando biblioteca...</p>
        </div>
      ) : roms.length === 0 ? (
        <div className="game-list__status">
          {hasEnabledSystems ? (
            <>
              <p className="game-list__status-title">Nenhum jogo encontrado</p>
              <p>Clique em "Reindexar biblioteca" pra escanear as pastas configuradas.</p>
            </>
          ) : (
            <>
              <p className="game-list__status-title">Nenhum console configurado</p>
              <p>Escolha quais consoles você emula e a pasta de roms de cada um.</p>
              <button className="btn-scan" onClick={onConfigureSystems}>
                Configurar consoles
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="game-list" role="list">
          {roms.map((rom) => {
            const tint = systemColor(rom.system);
            const isRunning = rom.path === runningPath;
            const maxPlayers = playerCounts[rom.path] ?? 2;
            return (
              <div
                key={rom.path}
                role="listitem"
                className="game-row"
                data-running={isRunning}
              >
                <div className="game-row__cover" style={{ background: tint }}>
                  <span className="game-row__initials">{initialsOf(rom.name)}</span>
                </div>

                <div className="game-row__info">
                  <p className="game-row__title">{rom.name}</p>
                  <p className="game-row__meta">
                    {systemLabel(rom.system)} · {formatSize(rom.size_bytes)}
                  </p>
                </div>

                <select
                  className="game-row__players"
                  data-overridden={maxPlayers > 2}
                  value={maxPlayers}
                  title="Número máximo de jogadores (multiplayer/Multitap)"
                  onChange={(e) => onSetPlayerCount(rom, Number(e.target.value))}
                >
                  {PLAYER_COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      👥 {n}
                    </option>
                  ))}
                </select>

                {isRunning ? (
                  <span className="game-row__running">Rodando...</span>
                ) : (
                  <button
                    className="game-row__play"
                    onClick={() => onPlay(rom)}
                    disabled={runningPath !== null}
                  >
                    ▶ Jogar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .game-list-wrap {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .game-list__error {
          padding: 0.75rem 1.5rem;
          background: color-mix(in srgb, var(--danger) 15%, var(--bg-void));
          color: var(--danger);
          font-size: 0.85rem;
          border-bottom: 1px solid var(--border-soft);
        }

        .game-list__status {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          color: var(--ink-muted);
          text-align: center;
          padding: 3rem;
        }

        .game-list__status-title {
          font-family: var(--font-display);
          font-size: 1.05rem;
          color: var(--ink-primary);
          margin: 0;
        }

        .game-list {
          flex: 1;
          overflow-y: auto;
        }

        .game-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.65rem 1.5rem;
          border-bottom: 1px solid var(--border-soft);
        }

        /* Só troca de cor de fundo — sem transição, sem custo de repaint extra */
        .game-row:hover {
          background: var(--bg-panel);
        }

        .game-row[data-running="true"] {
          background: color-mix(in srgb, var(--accent-teal) 10%, var(--bg-void));
        }

        .game-row__cover {
          flex: 0 0 auto;
          width: 56px;
          height: 74px; /* proporção 3:4, formato de box art */
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .game-row__initials {
          font-family: var(--font-display);
          font-size: 1.1rem;
          color: rgba(255, 255, 255, 0.9);
        }

        .game-row__info {
          flex: 1;
          min-width: 0; /* permite o ellipsis funcionar dentro do flex */
        }

        .game-row__title {
          margin: 0;
          font-weight: 600;
          font-size: 0.95rem;
          color: var(--ink-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .game-row__meta {
          margin: 0.15rem 0 0;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--ink-muted);
        }

        .game-row__play {
          flex: 0 0 auto;
          background: var(--accent-phosphor);
          color: var(--bg-void);
          border: none;
          border-radius: var(--radius-sm);
          padding: 0.5rem 0.9rem;
          font-weight: 600;
          font-size: 0.85rem;
          opacity: 0;
        }

        /* aparece no hover da linha inteira, não só do botão */
        .game-row:hover .game-row__play {
          opacity: 1;
        }

        .game-row__play:disabled {
          cursor: not-allowed;
        }

        .game-row__players {
          flex: 0 0 auto;
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          color: var(--ink-faint);
          font-size: 0.8rem;
          padding: 0.3rem 0.4rem;
        }

        /* só chama atenção quando foge do padrão (2 jogadores) — o resto da
           biblioteca não precisa desse ruído visual */
        .game-row__players[data-overridden="true"] {
          color: var(--accent-teal);
          border-color: var(--border-soft);
        }

        .game-row__running {
          flex: 0 0 auto;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--accent-teal);
        }
      `}</style>
    </div>
  );
}
