import { useEffect, useState } from "react";
import { GamepadCalibration } from "./GamepadCalibration";
import { listProfiles } from "./storage";
import type { GamepadProfile } from "./types";

interface ConnectedPad {
  index: number;
  id: string;
  hasProfile: boolean;
}

/**
 * Tela raiz do fluxo de gamepad: lista controles conectados (mostrando
 * se já têm perfil calibrado ou não) e permite (re)calibrar qualquer um.
 * Plugue isso numa rota/aba de "Configurações > Controles" do app.
 */
export function GamepadSettings() {
  const [connected, setConnected] = useState<ConnectedPad[]>([]);
  const [calibratingIndex, setCalibratingIndex] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<GamepadProfile[]>(listProfiles());

  useEffect(() => {
    function refresh() {
      const pads = navigator.getGamepads();
      const list: ConnectedPad[] = [];
      pads.forEach((pad, index) => {
        if (!pad) return;
        list.push({
          index,
          id: pad.id,
          hasProfile: profiles.some((p) => p.deviceId === pad.id),
        });
      });
      setConnected(list);
    }

    refresh();
    window.addEventListener("gamepadconnected", refresh);
    window.addEventListener("gamepaddisconnected", refresh);
    const interval = setInterval(refresh, 1000); // fallback, alguns browsers atrasam o evento

    return () => {
      window.removeEventListener("gamepadconnected", refresh);
      window.removeEventListener("gamepaddisconnected", refresh);
      clearInterval(interval);
    };
  }, [profiles]);

  if (calibratingIndex !== null) {
    return (
      <GamepadCalibration
        gamepadIndex={calibratingIndex}
        onComplete={() => {
          setProfiles(listProfiles());
          setCalibratingIndex(null);
        }}
        onCancel={() => setCalibratingIndex(null)}
      />
    );
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Controles</h2>
      {connected.length === 0 && (
        <p style={{ opacity: 0.7 }}>
          Nenhum controle detectado. Conecte um controle e aperte qualquer botão
          (alguns navegadores só detectam o controle depois da primeira interação).
        </p>
      )}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {connected.map((pad) => (
          <li
            key={pad.index}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.75rem",
              border: "1px solid #ccc",
              borderRadius: 8,
              marginBottom: "0.5rem",
            }}
          >
            <div>
              <strong>{pad.id}</strong>
              <p style={{ fontSize: "0.8rem", opacity: 0.7, margin: 0 }}>
                {pad.hasProfile ? "✅ Calibrado" : "⚠️ Não calibrado"}
              </p>
            </div>
            <button onClick={() => setCalibratingIndex(pad.index)}>
              {pad.hasProfile ? "Recalibrar" : "Calibrar"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
