import { useEffect, useState } from "react";
import type { RomEntry } from "../types/rom";
import { systemColor, systemLabel } from "./systemMeta";

interface Props {
  roms: RomEntry[];
  runningPath: string | null;
  error: string | null;
  loading: boolean;
  hasEnabledSystems: boolean;
  playerCounts: Record<string, number>;
  onPlay: (rom: RomEntry) => void;
  onConfigureSystems: () => void;
  onHost: (rom: RomEntry) => void;
  onClient: (rom: RomEntry) => void;
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
 * Lista + detalhe em 3 colunas (revisão #013, identidade "retro" — lista de
 * nomes / metadados / capa+ações), inspirada em frontends estilo Batocera.
 * Trocada da versão "lista estilo Steam" de linha única por pedido do
 * Bruno — ver aviso no CLAUDE.md/IDEAS.md sobre isso reintroduzir o tipo de
 * peso visual (sombra, transform) que o `GameDetailPanel.tsx` deprecado
 * tinha: aqui o transform/sombra só existe no item SELECIONADO da lista
 * (nunca em todos ao mesmo tempo, nem em hover de linha), o que é bem mais
 * barato de repintar.
 *
 * Sem metadata real de jogo (desenvolvedora/ano/nota) — só o que o app
 * realmente sabe: sistema, tamanho do arquivo e nº de jogadores (IGDB). Não
 * inventa campo nenhum.
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
  onHost,
  onClient,
}: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (roms.length === 0) {
      setSelectedPath(null);
      return;
    }
    if (!roms.some((r) => r.path === selectedPath)) {
      setSelectedPath(roms[0].path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roms]);

  const selected = roms.find((r) => r.path === selectedPath) ?? null;
  const selectedMaxPlayers = selected ? playerCounts[selected.path] ?? 2 : 2;
  const selectedRunning = selected !== null && selected.path === runningPath;

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
              <p className="game-list__status-title">0 jogos</p>
              <p>Nenhum jogo encontrado — clique em "Reindexar biblioteca" pra escanear as pastas configuradas.</p>
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
        <div className="game-list">
          <section className="game-list__column game-list__names" role="list">
            {roms.map((rom) => (
              <div
                key={rom.path}
                role="listitem"
                className="game-list__name-row"
                data-selected={rom.path === selectedPath}
                data-running={rom.path === runningPath}
                onClick={() => setSelectedPath(rom.path)}
              >
                {rom.name}
              </div>
            ))}
          </section>

          <section className="game-list__column game-list__meta">
            {selected ? (
              <>
                <h2 className="game-list__meta-title">{selected.name}</h2>
                <p className="game-list__meta-system">{systemLabel(selected.system)}</p>

                <div className="game-list__meta-grid">
                  <div>
                    <span className="game-list__meta-label">Tamanho</span>
                    <span className="game-list__meta-value">{formatSize(selected.size_bytes)}</span>
                  </div>
                  <div>
                    <span className="game-list__meta-label">Jogadores</span>
                    <span className="game-list__meta-value">
                      👥 {selectedMaxPlayers}
                      {selectedMaxPlayers > 1 ? " (multiplayer)" : ""}
                    </span>
                  </div>
                </div>

                <p className="game-list__meta-path">{selected.path}</p>
              </>
            ) : (
              <p className="game-list__meta-empty">Selecione um jogo na lista.</p>
            )}
          </section>

          <section className="game-list__column game-list__cover-col">
            {selected && (
              <>
                <div className="game-list__cover" style={{ background: systemColor(selected.system) }}>
                  <span>{initialsOf(selected.name)}</span>
                </div>

                {selectedRunning ? (
                  <p className="game-list__running">Rodando...</p>
                ) : (
                  <div className="game-list__cover-actions">
                    <button
                      className="game-list__play"
                      onClick={() => onPlay(selected)}
                      disabled={runningPath !== null}
                    >
                      ▶ Jogar
                    </button>
                    {selectedMaxPlayers > 1 && (
                      <div className="game-list__multiplayer-actions">
                        <button
                          className="game-list__multiplayer"
                          onClick={() => onHost(selected)}
                          disabled={runningPath !== null}
                          title="Hospedar uma partida multiplayer desse jogo"
                        >
                          Host
                        </button>
                        <button
                          className="game-list__multiplayer"
                          onClick={() => onClient(selected)}
                          disabled={runningPath !== null}
                          title="Entrar numa partida multiplayer desse jogo"
                        >
                          Cliente
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
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
          min-height: 0;
          display: grid;
          grid-template-columns: 1.1fr 1fr 0.85fr;
          gap: 1rem;
          padding: 1rem 1.5rem;
          overflow: hidden;
        }

        .game-list__column {
          background: var(--bg-shelf);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-md);
          overflow: hidden;
        }

        .game-list__names {
          overflow-y: auto;
          padding: 0.5rem;
        }

        .game-list__name-row {
          padding: 0.6rem 0.85rem;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--ink-muted);
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          /* transform só no item selecionado — nunca em todos os itens,
             é isso que mantém isso barato numa lista de centenas de linhas */
          transition: transform var(--transition-fast);
        }

        .game-list__name-row:hover {
          background: var(--bg-panel);
          color: var(--ink-primary);
        }

        .game-list__name-row[data-selected="true"] {
          background: var(--accent-phosphor);
          color: #fff;
          font-weight: 700;
          transform: translateX(4px);
        }

        .game-list__name-row[data-running="true"] {
          outline: 1px solid var(--accent-teal);
        }

        .game-list__meta {
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          overflow-y: auto;
        }

        .game-list__meta-empty {
          color: var(--ink-muted);
          font-size: 0.85rem;
        }

        .game-list__meta-title {
          font-family: var(--font-display);
          font-size: 1.15rem;
          color: var(--accent-phosphor);
          margin: 0;
          line-height: 1.3;
        }

        .game-list__meta-system {
          margin: 0;
          font-size: 0.8rem;
          color: var(--ink-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .game-list__meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
          background: var(--bg-panel);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          padding: 0.75rem;
        }

        .game-list__meta-grid > div {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }

        .game-list__meta-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--ink-faint);
        }

        .game-list__meta-value {
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: var(--ink-primary);
        }

        .game-list__meta-path {
          font-family: var(--font-mono);
          font-size: 0.7rem;
          color: var(--ink-faint);
          word-break: break-all;
          margin: 0;
        }

        .game-list__cover-col {
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
        }

        .game-list__cover {
          width: 100%;
          aspect-ratio: 3 / 4;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .game-list__cover span {
          font-family: var(--font-display);
          font-size: 2rem;
          color: rgba(255, 255, 255, 0.9);
        }

        .game-list__cover-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          width: 100%;
        }

        .game-list__play {
          background: var(--accent-phosphor);
          color: #fff;
          border: none;
          border-radius: var(--radius-sm);
          padding: 0.65rem;
          font-weight: 700;
          font-size: 0.9rem;
        }

        .game-list__multiplayer-actions {
          display: flex;
          gap: 0.5rem;
        }

        .game-list__multiplayer {
          flex: 1;
          background: transparent;
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-sm);
          color: var(--ink-primary);
          padding: 0.5rem;
          font-size: 0.8rem;
        }

        .game-list__play:disabled,
        .game-list__multiplayer:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .game-list__running {
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: var(--accent-teal);
        }
      `}</style>
    </div>
  );
}
