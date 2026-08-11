// Espelha src-tauri/src/protocol.rs — mantenha os dois em sincronia manualmente.

export interface PlayerView {
  id: string;
  nickname: string;
  ready: boolean;
}

export type ClientMessage =
  | { type: "list_games" }
  | { type: "create_room"; game_name: string; game_system: string; nickname: string }
  | { type: "join_room"; code: string; nickname: string }
  | { type: "set_ready"; ready: boolean };

export type ServerMessage =
  | { type: "games_list"; games: import("./rom").RomEntry[] }
  | {
      type: "room_state";
      code: string;
      game: import("./rom").RomEntry;
      max_players: number;
      players: PlayerView[];
    }
  | { type: "error"; message: string }
  | { type: "joined"; player_id: string }
  | {
      type: "match_starting";
      host_port: number;
      system: string;
      game_name: string;
      device_number: number;
    };

/** Porta fixa do WebSocket de lobby — ver PORT em src-tauri/src/server.rs. */
export const LOBBY_PORT = 7777;
