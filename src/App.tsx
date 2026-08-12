import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  RomEntry,
  SystemDefinition,
  SystemConfig,
  ReindexResult,
  PlayerCount,
  EnrichProgress,
  EnrichResult,
  EmulatorClosedPayload,
} from "./types/rom";
import { ConsoleCarousel } from "./components/ConsoleCarousel";
import { GameList } from "./components/GameList";
import { KNOWN_SYSTEM_IDS, systemLabel } from "./components/systemMeta";
import { SystemSelector } from "./components/SystemSelector";
import { AlphabetTabs, letterGroupOf } from "./components/AlphabetTabs";
import { Pagination } from "./components/Pagination";
import { LobbyScreen } from "./components/LobbyScreen";
import { KeyboardSettings } from "./components/KeyboardSettings";
import { HotkeysScreen } from "./components/HotkeysScreen";
import { InternetSettings } from "./components/InternetSettings";
import { buildKeyboardAppendConfigArgs } from "./keyboard/appendConfig";
import "./styles/theme.css";

const PAGE_SIZE = 50;

export default function App() {
  const [roms, setRoms] = useState<RomEntry[]>([]);
  const [systems, setSystems] = useState<SystemDefinition[]>([]);
  const [systemConfigs, setSystemConfigs] = useState<SystemConfig[]>([]);
  const [activeSystem, setActiveSystem] = useState<string | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [runningRom, setRunningRom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showKeyboardSettings, setShowKeyboardSettings] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showInternetSettings, setShowInternetSettings] = useState(false);
  const [lobby, setLobby] = useState<{ mode: "host" | "client"; game: RomEntry } | null>(null);
  const [installingRetroArch, setInstallingRetroArch] = useState(false);
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<EnrichProgress | null>(null);

  function refreshPlayerCounts() {
    invoke<PlayerCount[]>("get_player_counts").then((counts) => {
      const byPath: Record<string, number> = {};
      for (const c of counts) byPath[c.rom_path] = c.max_players;
      setPlayerCounts(byPath);
    });
  }

  async function handleEnrichPlayerCounts() {
    setError(null);
    setEnriching(true);
    setEnrichProgress(null);
    try {
      const result = await invoke<EnrichResult>("enrich_player_counts");
      refreshPlayerCounts();
      setError(
        `IGDB: ${result.checked} jogo(s) verificado(s), ${result.found} com dado de multiplayer.`
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setEnriching(false);
      setEnrichProgress(null);
    }
  }

  const hasEnabledSystems = useMemo(
    () => systemConfigs.some((c) => c.enabled),
    [systemConfigs]
  );

  function refreshSystemConfigs() {
    invoke<SystemConfig[]>("get_system_configs").then(setSystemConfigs);
  }

  useEffect(() => {
    invoke<SystemDefinition[]>("list_systems")
      .then(setSystems)
      .catch((e) => setError(String(e)));
    invoke<RomEntry[]>("list_library").then(setRoms);
    refreshSystemConfigs();
    refreshPlayerCounts();

    const unlistenClosed = listen<EmulatorClosedPayload>("emulator-closed", () => {
      setRunningRom(null);
    });
    const unlistenProgress = listen<EnrichProgress>("player-count-progress", (event) => {
      setEnrichProgress(event.payload);
    });

    return () => {
      unlistenClosed.then((fn) => fn());
      unlistenProgress.then((fn) => fn());
    };
  }, []);

  // Esc volta pro carrossel — mesma ideia do "B Voltar" de frontend estilo
  // Batocera, só que com uma tecla que a gente realmente escuta (não finge
  // suporte a botão de controle que ainda não está plugado, ver
  // gamepad/GamepadManager.ts — módulo pronto mas não integrado no App.tsx).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.key === "Escape" &&
        activeSystem !== null &&
        !showSettings &&
        !showKeyboardSettings &&
        !showHotkeys &&
        !lobby
      ) {
        setActiveSystem(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeSystem, showSettings, showKeyboardSettings, showHotkeys, lobby]);

  const systemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const rom of roms) {
      counts[rom.system] = (counts[rom.system] ?? 0) + 1;
    }
    return counts;
  }, [roms]);

  const visibleRoms = useMemo(() => {
    if (!activeSystem) return roms;
    return roms.filter((r) => r.system === activeSystem);
  }, [roms, activeSystem]);

  const letterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const rom of visibleRoms) {
      const letter = letterGroupOf(rom.name);
      counts[letter] = (counts[letter] ?? 0) + 1;
    }
    return counts;
  }, [visibleRoms]);

  const availableLetters = useMemo(() => Object.keys(letterCounts).sort(), [letterCounts]);

  const trimmedQuery = searchQuery.trim().toLowerCase();

  // Busca ignora a letra ativa (procura em todo o sistema selecionado); sem
  // busca, a letra recorta o que a paginação de 50 em 50 vai mostrar.
  const scopedRoms = useMemo(() => {
    if (trimmedQuery) {
      return visibleRoms.filter((r) => r.name.toLowerCase().includes(trimmedQuery));
    }
    if (activeLetter) {
      return visibleRoms.filter((r) => letterGroupOf(r.name) === activeLetter);
    }
    return visibleRoms;
  }, [visibleRoms, trimmedQuery, activeLetter]);

  const pageCount = Math.max(1, Math.ceil(scopedRoms.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const pagedRoms = useMemo(
    () => scopedRoms.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [scopedRoms, currentPage]
  );

  // Volta pra primeira página sempre que o recorte muda (sistema, letra ou busca).
  useEffect(() => {
    setPage(1);
  }, [activeSystem, activeLetter, trimmedQuery]);

  async function handleReindex() {
    setError(null);
    setReindexing(true);
    try {
      const result = await invoke<ReindexResult>("reindex_library");
      setRoms(result.roms);
      setActiveSystem(null);
      if (result.warnings.length > 0) {
        setError(result.warnings.join(" · "));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setReindexing(false);
    }
  }

  async function handlePlay(rom: RomEntry) {
    const system = systems.find((s) => s.id === rom.system);
    if (!system) {
      setError(`Nenhum emulador configurado para o sistema "${rom.system}"`);
      return;
    }

    setError(null);
    setRunningRom(rom.path);
    try {
      // Sem custo nas próximas vezes (checa se já existe antes de baixar) —
      // só demora de verdade na primeira partida de cada máquina.
      setInstallingRetroArch(true);
      await invoke("ensure_retroarch_installed");
      setInstallingRetroArch(false);

      const keyboardArgs = await buildKeyboardAppendConfigArgs();
      await invoke("launch_emulator", {
        emulatorPath: system.emulator_path,
        romPath: rom.path,
        extraArgs: [...system.extra_args, ...keyboardArgs],
      });
    } catch (e) {
      setError(String(e));
      setRunningRom(null);
    } finally {
      setInstallingRetroArch(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-header__title">Emu Launcher</h1>
        <div className="app-header__scan">
          <button className="btn-scan" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? "Fechar configurações" : "⚙ Consoles"}
          </button>
          <button className="btn-scan" onClick={() => setShowKeyboardSettings((v) => !v)}>
            {showKeyboardSettings ? "Fechar teclado" : "⌨ Teclado"}
          </button>
          <button className="btn-scan" onClick={() => setShowHotkeys((v) => !v)}>
            {showHotkeys ? "Fechar hotkeys" : "🔑 Hotkeys"}
          </button>
          <button className="btn-scan" onClick={() => setShowInternetSettings((v) => !v)}>
            {showInternetSettings ? "Fechar" : "🌐 Jogar pela Internet"}
          </button>
          <button className="btn-scan" onClick={handleReindex} disabled={reindexing}>
            {reindexing ? (
              <>
                <span className="spinner" /> Reindexando...
              </>
            ) : (
              "Reindexar biblioteca"
            )}
          </button>
          <button className="btn-scan" onClick={handleEnrichPlayerCounts} disabled={enriching}>
            {enriching ? (
              <>
                <span className="spinner" /> Buscando no IGDB...
              </>
            ) : (
              "👥 Buscar jogadores (IGDB)"
            )}
          </button>
        </div>
      </header>

      {installingRetroArch && (
        <div className="retroarch-banner">
          <span className="spinner" /> Preparando o RetroArch (só demora na primeira vez
          nesta máquina)...
        </div>
      )}

      {enriching && enrichProgress && (
        <div className="retroarch-banner">
          <span className="spinner" /> Verificando jogadores no IGDB: {enrichProgress.checked} de{" "}
          {enrichProgress.total}...
        </div>
      )}

      {showSettings ? (
        <main className="app-main">
          <SystemSelector
            onClose={() => setShowSettings(false)}
            onSaved={() => {
              refreshSystemConfigs();
              setShowSettings(false);
            }}
          />
        </main>
      ) : showKeyboardSettings ? (
        <main className="app-main">
          <KeyboardSettings onClose={() => setShowKeyboardSettings(false)} />
        </main>
      ) : showHotkeys ? (
        <main className="app-main">
          <HotkeysScreen onClose={() => setShowHotkeys(false)} />
        </main>
      ) : showInternetSettings ? (
        <main className="app-main">
          <InternetSettings onClose={() => setShowInternetSettings(false)} />
        </main>
      ) : lobby ? (
        <main className="app-main">
          <LobbyScreen mode={lobby.mode} game={lobby.game} onClose={() => setLobby(null)} />
        </main>
      ) : activeSystem === null ? (
        <main className="app-main">
          <ConsoleCarousel
            systemIds={KNOWN_SYSTEM_IDS}
            counts={systemCounts}
            onSelect={setActiveSystem}
          />
        </main>
      ) : (
        <>
          <div className="active-system-bar">
            <button className="active-system-bar__back" onClick={() => setActiveSystem(null)}>
              ← Consoles (Esc)
            </button>
            <span className="active-system-bar__label">{systemLabel(activeSystem)}</span>
          </div>

          <div className="search-row">
            <input
              className="search-row__input"
              type="text"
              placeholder="Buscar pelo nome do jogo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {!trimmedQuery && (
            <AlphabetTabs
              letters={availableLetters}
              counts={letterCounts}
              active={activeLetter}
              onSelect={(l) => setActiveLetter(l === activeLetter ? null : l)}
            />
          )}

          <main className="app-main">
            <GameList
              roms={pagedRoms}
              runningPath={runningRom}
              error={error}
              loading={reindexing}
              hasEnabledSystems={hasEnabledSystems}
              playerCounts={playerCounts}
              onPlay={handlePlay}
              onConfigureSystems={() => setShowSettings(true)}
              onHost={(rom) => setLobby({ mode: "host", game: rom })}
              onClient={(rom) => setLobby({ mode: "client", game: rom })}
              onPlayerCountChanged={refreshPlayerCounts}
            />
          </main>

          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />

          <footer className="game-footer">
            <span className="game-footer__key">
              <span className="game-footer__key-badge">Esc</span> Voltar
            </span>
            <span className="game-footer__key">
              <span className="game-footer__key-badge">▶</span> Jogar
            </span>
          </footer>
        </>
      )}

      <style>{`
        .app-shell {
          display: flex;
          flex-direction: column;
          height: 100vh;
        }

        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--border-soft);
        }

        .app-header__title {
          font-family: var(--font-display);
          font-size: 1.1rem;
          letter-spacing: 0.02em;
          margin: 0;
          color: var(--accent-phosphor);
          /* sem text-shadow — era decoração, não essencial, e custa repaint */
        }

        .app-header__scan {
          display: flex;
          gap: 0.5rem;
        }

        .btn-scan {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 1rem;
          background: var(--accent-phosphor);
          color: #fff;
          border: none;
          border-radius: var(--radius-sm);
          font-weight: 600;
          font-size: 0.85rem;
        }

        .btn-scan:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .app-main {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .retroarch-banner {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.6rem 1.5rem;
          background: color-mix(in srgb, var(--accent-phosphor) 15%, var(--bg-void));
          color: var(--ink-primary);
          font-size: 0.85rem;
          border-bottom: 1px solid var(--border-soft);
        }

        .active-system-bar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1.5rem;
          border-bottom: 1px solid var(--border-soft);
        }

        .active-system-bar__back {
          background: transparent;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-primary);
          padding: 0.4rem 0.8rem;
          font-size: 0.85rem;
          cursor: pointer;
        }

        .active-system-bar__label {
          font-family: var(--font-display);
          font-size: 0.95rem;
          color: var(--accent-phosphor);
        }

        .game-footer {
          display: flex;
          justify-content: center;
          gap: 1.5rem;
          padding: 0.65rem;
          border-top: 1px solid var(--border-soft);
        }

        .game-footer__key {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--ink-muted);
        }

        .game-footer__key-badge {
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

        .search-row {
          padding: 0.75rem 1.5rem;
          border-bottom: 1px solid var(--border-soft);
        }

        .search-row__input {
          width: 100%;
          background: var(--bg-panel);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-primary);
          font-family: var(--font-body);
          font-size: 0.85rem;
          padding: 0.5rem 0.75rem;
        }

        .search-row__input::placeholder {
          color: var(--ink-faint);
        }
      `}</style>
    </div>
  );
}
