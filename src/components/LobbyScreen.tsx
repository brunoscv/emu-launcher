import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLobbyClient } from "../lobby/useLobbyClient";
import type { RomEntry, SystemDefinition, LaunchResult } from "../types/rom";
import type { ServerMessage } from "../types/lobby";
import { systemLabel } from "./systemMeta";
import { buildKeyboardAppendConfigArgs } from "../keyboard/appendConfig";

interface Props {
  mode: "host" | "client";
  game: RomEntry | null; // sempre presente em modo "host"
  onClose: () => void;
}

type Phase = "setup" | "connecting" | "room";

/**
 * Lobby direto por jogo (IDEAS.md #008) — substitui a antiga tela genérica
 * "🎮 Multiplayer" (conectar num IP, escolher jogo da lista do servidor).
 * Quem clica "Host"/"Cliente" numa linha da `GameList` já chega aqui sabendo
 * o jogo; o endereço do lobby (servidor dedicado ou fallback embutido nessa
 * própria máquina) é resolvido sozinho via `resolve_lobby_host`.
 */
export function LobbyScreen({ mode, game, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [nickname, setNickname] = useState("Jogador");
  const [joinCode, setJoinCode] = useState("");
  const [hostOverride, setHostOverride] = useState("");
  const [resolvedHost, setResolvedHost] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [roomState, setRoomState] = useState<
    Extract<ServerMessage, { type: "room_state" }> | null
  >(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const emulatorPidRef = useRef<number | null>(null);

  function handleLobbyMessage(msg: ServerMessage) {
    if (msg.type === "room_state") setRoomState(msg);
    if (msg.type === "joined") setMyPlayerId(msg.player_id);
    if (msg.type === "match_starting" && !startedRef.current) {
      startedRef.current = true;
      handleMatchStarting(msg.host_port, msg.system, msg.game_name);
    }
    if (msg.type === "error") setSetupError(msg.message);
  }

  const { connected, error, connect, send, disconnect } = useLobbyClient(handleLobbyMessage);

  // Pré-preenche o campo de IP em modo cliente com o que o resolve_lobby_host
  // acharia por padrão (servidor dedicado, se configurado e online) — o
  // jogador ainda pode sobrescrever com o IP de quem tá hospedando, caso o
  // host tenha caído no modo embutido local (sem servidor dedicado).
  useEffect(() => {
    if (mode === "client") {
      invoke<string>("resolve_lobby_host")
        .then(setHostOverride)
        .catch(() => {});
    }
  }, [mode]);

  async function handleStart() {
    setSetupError(null);
    setPhase("connecting");
    try {
      const host = mode === "host" ? await invoke<string>("resolve_lobby_host") : hostOverride.trim();
      if (!host) throw new Error("Informe o IP de quem está hospedando.");
      setResolvedHost(host);
      connect(host);
    } catch (e) {
      setSetupError(String(e));
      setPhase("setup");
    }
  }

  // Assim que a conexão WebSocket abre, dispara create_room (host, jogo já
  // escolhido na GameList) ou join_room (cliente, código digitado no setup).
  useEffect(() => {
    if (!connected || phase !== "connecting") return;
    if (mode === "host" && game) {
      send({ type: "create_room", game_name: game.name, game_system: game.system, nickname });
    } else if (mode === "client") {
      send({ type: "join_room", code: joinCode.trim().toUpperCase(), nickname });
    }
    setPhase("room");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, phase]);

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

      const keyboardArgs = await buildKeyboardAppendConfigArgs();
      await invoke("ensure_retroarch_installed");
      const result = await invoke<LaunchResult>("launch_emulator", {
        emulatorPath: systemDef.emulator_path,
        romPath: localRom.path,
        extraArgs: [
          ...systemDef.extra_args,
          "--connect",
          resolvedHost ?? "127.0.0.1",
          "--port",
          String(hostPort),
          ...keyboardArgs,
        ],
      });
      emulatorPidRef.current = result.pid;
    } catch (e) {
      setLaunchError(String(e));
    } finally {
      setLaunching(false);
    }
  }

  // Se o RetroArch fechar, desmarca "pronto" sozinho — senão a sala fica
  // achando que esse jogador ainda está pronto sem emulador nenhum aberto.
  const roomStateRef = useRef(roomState);
  roomStateRef.current = roomState;

  useEffect(() => {
    const unlistenPromise = listen("emulator-closed", () => {
      startedRef.current = false;
      emulatorPidRef.current = null;
      if (roomStateRef.current) send({ type: "set_ready", ready: false });
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [send]);

  function handleToggleReady() {
    if (!roomState || !myPlayerId) return;
    const me = roomState.players.find((p) => p.id === myPlayerId);
    send({ type: "set_ready", ready: !me?.ready });
  }

  function handleClose() {
    // Mata o RetroArch local que essa sala disparou (se ainda tiver algum)
    // — senão fica um processo órfão rodando, causando exatamente a
    // confusão de "abri o app e caiu numa sessão antiga" (bug real
    // encontrado 11/08/2026).
    if (emulatorPidRef.current !== null) {
      invoke("kill_emulator", { pid: emulatorPidRef.current }).catch(() => {});
      emulatorPidRef.current = null;
    }
    disconnect();
    onClose();
  }

  const me = roomState?.players.find((p) => p.id === myPlayerId);

  return (
    <div className="lobby-screen">
      <h2 className="lobby-screen__title">
        {mode === "host" ? "🎮 Hospedar partida" : "🎮 Entrar numa partida"}
        {game && ` · ${game.name}`}
      </h2>

      {(error || setupError || launchError) && (
        <div className="lobby-screen__error">{error ?? setupError ?? launchError}</div>
      )}

      {phase === "setup" && (
        <div className="lobby-screen__setup">
          <input
            className="lobby-screen__input"
            placeholder="Seu apelido"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />

          {mode === "client" && (
            <>
              <input
                className="lobby-screen__input"
                placeholder="IP de quem está hospedando"
                value={hostOverride}
                onChange={(e) => setHostOverride(e.target.value)}
              />
              <input
                className="lobby-screen__input"
                placeholder="Código da sala"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
              />
            </>
          )}

          <div className="lobby-screen__actions">
            <button
              className="btn-scan"
              onClick={handleStart}
              disabled={mode === "client" && (!hostOverride.trim() || !joinCode.trim())}
            >
              {mode === "host" ? "Criar sala" : "Entrar"}
            </button>
            <button className="lobby-screen__cancel" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {phase === "connecting" && (
        <p className="lobby-screen__status">
          <span className="spinner" /> Conectando...
        </p>
      )}

      {phase === "room" && roomState && (
        <div className="lobby-screen__room">
          <p className="lobby-screen__room-code">
            Código da sala: <strong>{roomState.code}</strong>
          </p>
          <p className="lobby-screen__game">
            {roomState.game.name} · {systemLabel(roomState.game.system)} · até {roomState.max_players}{" "}
            jogador(es)
          </p>

          <ul className="lobby-screen__players">
            {roomState.players.map((p) => (
              <li key={p.id} data-ready={p.ready}>
                {p.ready ? "✅" : "⏳"} {p.nickname} {p.id === myPlayerId && "(você)"}
              </li>
            ))}
          </ul>

          {launching ? (
            <p className="lobby-screen__status">
              <span className="spinner" /> Partida começando, conectando no host...
            </p>
          ) : (
            <button className="btn-scan" onClick={handleToggleReady}>
              {me?.ready ? "Cancelar pronto" : "Pronto"}
            </button>
          )}

          <button className="lobby-screen__cancel" onClick={handleClose}>
            Sair da sala
          </button>
        </div>
      )}

      {phase === "room" && !roomState && (
        <p className="lobby-screen__status">
          <span className="spinner" /> Entrando na sala...
        </p>
      )}

      <style>{`
        .lobby-screen {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          overflow-y: auto;
          gap: 1rem;
        }

        .lobby-screen__title {
          font-family: var(--font-display);
          font-size: 1rem;
          color: var(--ink-primary);
          margin: 0;
        }

        .lobby-screen__error {
          padding: 0.6rem 0.9rem;
          background: color-mix(in srgb, var(--danger) 15%, var(--bg-void));
          color: var(--danger);
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
        }

        .lobby-screen__setup {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          max-width: 360px;
        }

        .lobby-screen__input {
          background: var(--bg-panel);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-primary);
          font-family: var(--font-mono);
          font-size: 0.85rem;
          padding: 0.55rem 0.75rem;
        }

        .lobby-screen__actions {
          display: flex;
          gap: 0.6rem;
          margin-top: 0.4rem;
        }

        .lobby-screen__status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--ink-muted);
          font-size: 0.85rem;
        }

        .lobby-screen__room-code {
          font-family: var(--font-mono);
          font-size: 1.1rem;
          color: var(--ink-primary);
        }

        .lobby-screen__game {
          color: var(--ink-muted);
          font-size: 0.85rem;
        }

        .lobby-screen__players {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .lobby-screen__players li {
          font-size: 0.9rem;
          color: var(--ink-primary);
        }

        .lobby-screen__cancel {
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
