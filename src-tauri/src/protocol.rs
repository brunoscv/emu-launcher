use crate::scanner::RomEntry;
use serde::{Deserialize, Serialize};

/// Mensagens que o cliente manda pro servidor de lobby (Fase 5b, ver
/// IDEAS.md #007). Ainda sem disparo de RetroArch — só sala: listar jogos
/// (da biblioteca do próprio servidor), criar, entrar, marcar pronto.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    ListGames,
    CreateRoom { rom_path: String, nickname: String },
    JoinRoom { code: String, nickname: String },
    SetReady { ready: bool },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlayerView {
    pub id: String,
    pub nickname: String,
    pub ready: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    GamesList { games: Vec<RomEntry> },
    RoomState {
        code: String,
        game: RomEntry,
        max_players: i64,
        players: Vec<PlayerView>,
    },
    Error { message: String },
}
