import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "../types/lobby";
import { LOBBY_PORT } from "../types/lobby";

/**
 * WebSocket cru — o webview do Tauri já suporta a API de WebSocket nativa
 * do browser, não precisa passar isso pelo lado Rust. Só a ação final
 * (disparar o RetroArch local em modo cliente quando a partida começa)
 * passa por `invoke`, feito por quem usa esse hook (LobbyScreen).
 *
 * `onMessage` é chamado direto dentro do `onmessage` do WebSocket, não
 * guardado num state de "última mensagem" — o servidor sempre manda
 * `joined` seguido de `room_state` na entrada da sala, e em conexão local
 * (127.0.0.1, latência ~0) as duas chegam próximas o suficiente pro React
 * agrupar os dois `setState` numa única renderização, perdendo a mensagem
 * `joined` (só a mais recente sobrevive). Processar cada mensagem na hora
 * evita esse tipo de perda.
 */
export function useLobbyClient(onMessage: (msg: ServerMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (msg.type === "error") setError(msg.message);
      onMessageRef.current(msg);
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

  return { connected, error, connect, send, disconnect };
}
