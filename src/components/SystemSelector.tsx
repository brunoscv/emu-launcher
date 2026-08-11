import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SystemConfig } from "../types/rom";
import { KNOWN_SYSTEM_IDS, systemColor, systemLabel } from "./systemMeta";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

/**
 * `enabled` é sempre derivado de "tem pasta preenchida?" nessa tela — evita o
 * caso de salvar uma pasta com o console ainda desmarcado (já aconteceu: pasta
 * certa no banco, `enabled = 0`, reindex não achava nada porque pulava o
 * sistema).
 */
function withDefaults(loaded: SystemConfig[]): SystemConfig[] {
  const bySystem = new Map(loaded.map((c) => [c.system_id, c]));
  return KNOWN_SYSTEM_IDS.map((id) => {
    const existing = bySystem.get(id);
    const rom_folder = existing?.rom_folder ?? null;
    return { system_id: id, rom_folder, enabled: (rom_folder ?? "").trim() !== "" };
  });
}

/**
 * Menu "quais consoles eu emulo" — cada console habilitado tem sua própria
 * pasta de roms (estilo Batocera/EmulationStation). Salva no SQLite via
 * save_system_configs; a reindexação em si é um botão separado no App.tsx,
 * pra deixar claro que é uma ação cara feita sob demanda.
 */
export function SystemSelector({ onClose, onSaved }: Props) {
  const [configs, setConfigs] = useState<SystemConfig[]>(withDefaults([]));
  const [dedicatedServer, setDedicatedServer] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<SystemConfig[]>("get_system_configs")
      .then((loaded) => setConfigs(withDefaults(loaded)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    invoke<string | null>("get_dedicated_server_host").then((host) => setDedicatedServer(host ?? ""));
  }, []);

  function updateFolder(systemId: string, romFolder: string) {
    setConfigs((prev) =>
      prev.map((c) =>
        c.system_id === systemId
          ? { ...c, rom_folder: romFolder, enabled: romFolder.trim() !== "" }
          : c
      )
    );
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await invoke("save_system_configs", { configs });
      await invoke("save_dedicated_server_host", { host: dedicatedServer });
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="system-selector">
      <div className="system-selector__header">
        <h2>Configurar consoles</h2>
        <button className="system-selector__close" onClick={onClose}>
          Voltar
        </button>
      </div>

      {error && <div className="system-selector__error">{error}</div>}

      {loading ? (
        <p className="system-selector__hint">Carregando...</p>
      ) : (
        <>
          <p className="system-selector__hint">
            Preencha a pasta de roms dos consoles que você quer emular. Deixe em branco
            os que não usa — sem pasta, o console fica de fora da biblioteca.
          </p>
          <div className="system-selector__list">
            {configs.map((config) => (
              <div key={config.system_id} className="system-selector__row">
                <span className="system-selector__check">
                  <span
                    className="system-selector__dot"
                    style={{ background: systemColor(config.system_id) }}
                  />
                  {systemLabel(config.system_id)}
                </span>

                <input
                  className="system-selector__folder"
                  type="text"
                  placeholder="/caminho/para/roms/deste-console"
                  value={config.rom_folder ?? ""}
                  onChange={(e) => updateFolder(config.system_id, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="system-selector__server">
            <label className="system-selector__server-label" htmlFor="dedicated-server">
              Servidor dedicado (opcional)
            </label>
            <input
              id="dedicated-server"
              className="system-selector__folder"
              type="text"
              placeholder="ex: 192.168.1.50 — deixe em branco pra não usar nenhum"
              value={dedicatedServer}
              onChange={(e) => setDedicatedServer(e.target.value)}
            />
            <p className="system-selector__hint">
              Quando clicar em "Host", o app tenta esse endereço primeiro. Se não responder
              (ou se ficar em branco), a própria máquina vira lobby + host da partida.
            </p>
          </div>
        </>
      )}

      <div className="system-selector__actions">
        <button className="btn-scan" onClick={handleSave} disabled={saving || loading}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      <style>{`
        .system-selector {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          overflow-y: auto;
        }

        .system-selector__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }

        .system-selector__header h2 {
          font-family: var(--font-display);
          font-size: 1rem;
          color: var(--ink-primary);
          margin: 0;
        }

        .system-selector__close {
          background: transparent;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-muted);
          padding: 0.4rem 0.8rem;
          font-size: 0.8rem;
        }

        .system-selector__error {
          padding: 0.6rem 0.9rem;
          background: color-mix(in srgb, var(--danger) 15%, var(--bg-void));
          color: var(--danger);
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          margin-bottom: 1rem;
        }

        .system-selector__hint {
          color: var(--ink-muted);
        }

        .system-selector__list {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .system-selector__row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.6rem 0.75rem;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
        }

        .system-selector__check {
          flex: 0 0 220px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--ink-primary);
        }

        .system-selector__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .system-selector__folder {
          flex: 1;
          background: var(--bg-panel);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-primary);
          font-family: var(--font-mono);
          font-size: 0.8rem;
          padding: 0.5rem 0.7rem;
        }

        .system-selector__actions {
          margin-top: 1.25rem;
        }

        .system-selector__server {
          margin-top: 1.5rem;
          padding-top: 1.25rem;
          border-top: 1px solid var(--border-soft);
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .system-selector__server-label {
          font-weight: 600;
          font-size: 0.85rem;
          color: var(--ink-primary);
        }
      `}</style>
    </div>
  );
}
