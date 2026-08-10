import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  RomEntry,
  SystemDefinition,
  SystemConfig,
  ReindexResult,
  EmulatorClosedPayload,
} from "./types/rom";
import { SystemTabs } from "./components/SystemTabs";
import { GameList } from "./components/GameList";
import { SystemSelector } from "./components/SystemSelector";
import { AlphabetTabs, letterGroupOf } from "./components/AlphabetTabs";
import { Pagination } from "./components/Pagination";
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

  const hasEnabledSystems = useMemo(
    () => systemConfigs.some((c) => c.enabled),
    [systemConfigs]
  );

  function refreshSystemConfigs() {
    invoke<SystemConfig[]>("get_system_configs").then(setSystemConfigs);
  }

  useEffect(() => {
    invoke<SystemDefinition[]>("list_systems").then(setSystems);
    invoke<RomEntry[]>("list_library").then(setRoms);
    refreshSystemConfigs();

    const unlisten = listen<EmulatorClosedPayload>("emulator-closed", () => {
      setRunningRom(null);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const systemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const rom of roms) {
      counts[rom.system] = (counts[rom.system] ?? 0) + 1;
    }
    return counts;
  }, [roms]);

  const availableSystems = useMemo(() => Object.keys(systemCounts).sort(), [systemCounts]);

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
      await invoke("launch_emulator", {
        emulatorPath: system.emulator_path,
        romPath: rom.path,
        extraArgs: system.extra_args,
      });
    } catch (e) {
      setError(String(e));
      setRunningRom(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-header__title">Emu Launcher</h1>
        <div className="app-header__scan">
          <button
            className="btn-scan"
            onClick={() => setShowSettings((v) => !v)}
          >
            {showSettings ? "Fechar configurações" : "⚙ Consoles"}
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
        </div>
      </header>

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
      ) : (
        <>
          <SystemTabs
            systems={availableSystems}
            counts={systemCounts}
            active={activeSystem}
            onSelect={(s) => setActiveSystem(s === activeSystem ? null : s)}
          />

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
              onPlay={handlePlay}
              onConfigureSystems={() => setShowSettings(true)}
            />
          </main>

          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
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
          color: var(--bg-void);
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
