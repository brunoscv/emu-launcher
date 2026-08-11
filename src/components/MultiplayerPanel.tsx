import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLobbyClient } from "../lobby/useLobbyClient";
import type { RomEntry, SystemDefinition } from "../types/rom";
import type { ServerMessage } from "../types/lobby";
import { systemLabel } from "./systemMeta";

/**
 * Tela "🎮 Multiplayer" — cliente do servidor de lobby (Fase 5, ver
 * IDEAS.md #007). Conecta via WebSocket cru (useLobbyClient), lista os
 * jogos da biblioteca do SERVIDOR (não a local — é ele quem hospeda),
 * cria/entra em sala, mostra quem está pronto e, quando a partida começa,
 * resolve o jogo/core LOCAL correspondente e dispara o RetroArch em modo
 * cliente (--connect) automaticamente.
 */
export function MultiplayerPanel() {
  const [serverHost, setServerHost] = useState("");
  const [nickname, setNickname] = useState("Jogador");
  const [joinCode, setJoinCode] = useState("");

  const [gamesList, setGamesList] = useState<RomEntry[] | null>(null);
  const [roomState, setRoomState] = useState<
    Extract<ServerMessage, { type: "room_state" }> | null
  >(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const startedRef = useRef(false);

  function handleLobbyMessage(msg: ServerMessage) {
    if (msg.type === "games_list") setGamesList(msg.games);
    if (msg.type === "room_state") setRoomState(msg);
    if (msg.type === "joined") setMyPlayerId(msg.player_id);
    if (msg.type === "match_starting" && !startedRef.current) {
      startedRef.current = true;
      handleMatchStarting(msg.host_port, msg.system, msg.game_name);
    }
  }

  const { connected, error, connect, send, disconnect } = useLobbyClient(handleLobbyMessage);

  useEffect(() => {
    if (connected) send({ type: "list_games" });
  }, [connected, send]);

  async function handleMatchStarting(hostPort: number, system: string, gameName: string) {
    setLaunchError(null);
    setLaunching(true);
    try {
      const systemDef = (await invoke<SystemDefinition[]>("list_systems")).find((s) => s.id === system);
      if (!systemDef) {
        throw new Error(`Nenhum emulador configurado localmente pro sistema "${system}"`);
      }

      const localRom = (await invoke<RomEntry[]>("list_library")).find(
        (r) => r.name === gameName && r.system === system
      );
      if (!localRom) {
        throw new Error(`Você não tem "${gameName}" na sua biblioteca local — reindexe ou copie a rom.`);
      }

      await invoke("ensure_retroarch_installed");
      await invoke("launch_emulator", {
        emulatorPath: systemDef.emulator_path,
        romPath: localRom.path,
        extraArgs: [...systemDef.extra_args, "--connect", serverHost, "--port", String(hostPort)],
      });
    } catch (e) {
      setLaunchError(String(e));
    } finally {
      setLaunching(false);
    }
  }

  function handleConnect() {
    startedRef.current = false;
    setRoomState(null);
    setMyPlayerId(null);
    connect(serverHost.trim());
  }

  function handleCreateRoom(rom: RomEntry) {
    send({ type: "create_room", rom_path: rom.path, nickname: nickname.trim() || "Jogador" });
  }

  function handleJoinRoom() {
    if (!joinCode.trim()) return;
    send({ type: "join_room", code: joinCode.trim().toUpperCase(), nickname: nickname.trim() || "Jogador" });
  }

  function handleToggleReady() {
    if (!roomState || !myPlayerId) return;
    const me = roomState.players.find((p) => p.id === myPlayerId);
    send({ type: "set_ready", ready: !me?.ready });
  }

  const me = roomState?.players.find((p) => p.id === myPlayerId);

  return (
    <div className="multiplayer-panel">
      <h2 className="multiplayer-panel__title">🎮 Multiplayer</h2>

      {(error || launchError) && (
        <div className="multiplayer-panel__error">{error ?? launchError}</div>
      )}

      {!connected ? (
        <div className="multiplayer-panel__connect">
          <input
            className="multiplayer-panel__input"
            placeholder="IP do servidor (ex: 192.168.1.50)"
            value={serverHost}
            onChange={(e) => setServerHost(e.target.value)}
          />
          <input
            className="multiplayer-panel__input"
            placeholder="Seu apelido"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <button className="btn-scan" onClick={handleConnect} disabled={!serverHost.trim()}>
            Conectar
          </button>
        </div>
      ) : roomState ? (
        <div className="multiplayer-panel__room">
          <p className="multiplayer-panel__room-code">
            Código da sala: <strong>{roomState.code}</strong>
          </p>
          <p className="multiplayer-panel__game">
            {roomState.game.name} · {systemLabel(roomState.game.system)} · até {roomState.max_players}{" "}
            jogador(es)
          </p>

          <ul className="multiplayer-panel__players">
            {roomState.players.map((p) => (
              <li key={p.id} data-ready={p.ready}>
                {p.ready ? "✅" : "⏳"} {p.nickname} {p.id === myPlayerId && "(você)"}
              </li>
            ))}
          </ul>

          {launching ? (
            <p className="multiplayer-panel__status">
              <span className="spinner" /> Partida começando, conectando no host...
            </p>
          ) : (
            <button className="btn-scan" onClick={handleToggleReady}>
              {me?.ready ? "Cancelar pronto" : "Pronto"}
            </button>
          )}

          <button className="multiplayer-panel__disconnect" onClick={disconnect}>
            Sair da sala
          </button>
        </div>
      ) : (
        <div className="multiplayer-panel__lobby">
          <section>
            <h3>Entrar com código</h3>
            <div className="multiplayer-panel__join">
              <input
                className="multiplayer-panel__input"
                placeholder="Código da sala"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
              />
              <button className="btn-scan" onClick={handleJoinRoom} disabled={!joinCode.trim()}>
                Entrar
              </button>
            </div>
          </section>

          <section>
            <h3>Criar sala (jogos disponíveis no servidor)</h3>
            {gamesList === null ? (
              <p className="multiplayer-panel__status">Carregando biblioteca do servidor...</p>
            ) : gamesList.length === 0 ? (
              <p className="multiplayer-panel__status">O servidor ainda não tem nenhum jogo indexado.</p>
            ) : (
              <ul className="multiplayer-panel__games">
                {gamesList.map((rom) => (
                  <li key={rom.path}>
                    <span>
                      {rom.name} · {systemLabel(rom.system)}
                    </span>
                    <button className="btn-scan" onClick={() => handleCreateRoom(rom)}>
                      Criar sala
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <style>{`
        .multiplayer-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          overflow-y: auto;
          gap: 1rem;
        }

        .multiplayer-panel__title {
          font-family: var(--font-display);
          font-size: 1rem;
          color: var(--ink-primary);
          margin: 0;
        }

        .multiplayer-panel__error {
          padding: 0.6rem 0.9rem;
          background: color-mix(in srgb, var(--danger) 15%, var(--bg-void));
          color: var(--danger);
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
        }

        .multiplayer-panel__connect,
        .multiplayer-panel__join {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .multiplayer-panel__input {
          flex: 1;
          min-width: 180px;
          background: var(--bg-panel);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-primary);
          font-family: var(--font-mono);
          font-size: 0.85rem;
          padding: 0.55rem 0.75rem;
        }

        .multiplayer-panel__lobby {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .multiplayer-panel__lobby h3 {
          font-family: var(--font-display);
          font-size: 0.9rem;
          color: var(--ink-primary);
          margin: 0 0 0.6rem;
        }

        .multiplayer-panel__games {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          max-height: 320px;
          overflow-y: auto;
        }

        .multiplayer-panel__games li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          color: var(--ink-primary);
        }

        .multiplayer-panel__room-code {
          font-family: var(--font-mono);
          font-size: 1.1rem;
          color: var(--ink-primary);
        }

        .multiplayer-panel__game {
          color: var(--ink-muted);
          font-size: 0.85rem;
        }

        .multiplayer-panel__players {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .multiplayer-panel__players li {
          font-size: 0.9rem;
          color: var(--ink-primary);
        }

        .multiplayer-panel__status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--ink-muted);
          font-size: 0.85rem;
        }

        .multiplayer-panel__disconnect {
          background: transparent;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-muted);
          padding: 0.4rem 0.8rem;
          font-size: 0.8rem;
          align-self: flex-start;
        }
      `}</style>
    </div>
  );
}
