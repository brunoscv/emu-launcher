use crate::scanner::RomEntry;
use serde::{Deserialize, Serialize};

/// Mensagens que o cliente manda pro servidor de lobby (ver IDEAS.md #007).
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    ListGames,
    /// Resolvido por nome+sistema, não por path exato (IDEAS.md #008) — quem
    /// manda essa mensagem pode estar numa máquina diferente da do servidor,
    /// com o mesmo jogo numa pasta diferente (path não bate, nome+sistema
    /// sim). Mesmo princípio que o cliente já usa pra achar a rom local
    /// quando a partida começa (ver `MatchStarting`).
    CreateRoom {
        game_name: String,
        game_system: String,
        nickname: String,
    },
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
    /// Mandado só pra quem acabou de criar/entrar na sala (não é broadcast)
    /// — sem isso o cliente não tem como saber qual `PlayerView` do
    /// `RoomState` é ele mesmo (apelido não é único).
    Joined { player_id: String },
    /// Sala completou (cheia + todos prontos) e o servidor já disparou o
    /// RetroArch host (Fase 5c). O cliente resolve o core/rom localmente
    /// pelo `system` + `game_name` (mesmo `systems::list_systems()` que já
    /// usa hoje) e conecta em `--connect <ip_do_servidor> --port host_port`
    /// — o IP já é o mesmo que ele usou pra conectar no lobby.
    MatchStarting {
        host_port: u16,
        system: String,
        game_name: String,
    },
}
