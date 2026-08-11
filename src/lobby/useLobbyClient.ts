import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "../types/lobby";
import { LOBBY_PORT } from "../types/lobby";

/**
 * WebSocket cru — o webview do Tauri já suporta a API de WebSocket nativa
 * do browser, não precisa passar isso pelo lado Rust. Só a ação final
 * (disparar o RetroArch local em modo cliente quando a partida começa)
 * passa por `invoke`, feito por quem usa esse hook (MultiplayerPanel).
 */
export function useLobbyClient() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);

  const connect = useCallback((host: string) => {
    setError(null);
    const ws = new WebSocket(`ws://${host}:${LOBBY_PORT}`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError(`Não consegui conectar em ${host}:${LOBBY_PORT}`);
    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return; // mensagem que não é JSON válido — ignora
      }
      setLastMessage(msg);
      if (msg.type === "error") setError(msg.message);
    };

    wsRef.current?.close();
    wsRef.current = ws;
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  return { connected, error, lastMessage, connect, send, disconnect };
}
