use crate::library;
use crate::player_overrides;
use crate::protocol::{PlayerView, ServerMessage};
use crate::scanner::RomEntry;
use rand::Rng;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc::UnboundedSender;
use tokio_tungstenite::tungstenite::Message;

pub struct Player {
    pub id: String,
    pub nickname: String,
    pub ready: bool,
    pub tx: UnboundedSender<Message>,
}

pub struct Room {
    pub code: String,
    pub game: RomEntry,
    pub max_players: i64,
    pub players: Vec<Player>,
}

/// Estado do lobby inteiro — em memória, de propósito: salas são efêmeras,
/// só existem enquanto uma partida está sendo organizada. `Mutex` (não
/// `tokio::sync::Mutex`) porque as seções críticas aqui são sempre síncronas
/// e curtas, sem `.await` no meio — mais leve que o mutex assíncrono.
pub type Rooms = Arc<Mutex<HashMap<String, Room>>>;

pub fn new_rooms() -> Rooms {
    Arc::new(Mutex::new(HashMap::new()))
}

fn lock_err() -> String {
    "lobby travado (lock envenenado por um panic anterior)".to_string()
}

fn generate_code(existing: &HashMap<String, Room>) -> String {
    const LETTERS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let mut rng = rand::thread_rng();
    loop {
        let code: String = (0..4)
            .map(|_| LETTERS[rng.gen_range(0..LETTERS.len())] as char)
            .collect();
        if !existing.contains_key(&code) {
            return code;
        }
    }
}

/// Mesma regra que a UI já usa (`get_player_counts` só tem entrada pra quem
/// é > 2; ausência = assume 2).
fn max_players_for(rom_path: &str) -> Result<i64, String> {
    let counts = player_overrides::get_player_counts()?;
    Ok(counts
        .into_iter()
        .find(|c| c.rom_path == rom_path)
        .map(|c| c.max_players)
        .unwrap_or(2))
}

fn room_state_message(room: &Room) -> ServerMessage {
    ServerMessage::RoomState {
        code: room.code.clone(),
        game: room.game.clone(),
        max_players: room.max_players,
        players: room
            .players
            .iter()
            .map(|p| PlayerView {
                id: p.id.clone(),
                nickname: p.nickname.clone(),
                ready: p.ready,
            })
            .collect(),
    }
}

fn broadcast(room: &Room) {
    let text = serde_json::to_string(&room_state_message(room)).unwrap_or_default();
    for player in &room.players {
        let _ = player.tx.send(Message::text(text.clone()));
    }
}

pub fn list_games() -> Result<ServerMessage, String> {
    Ok(ServerMessage::GamesList {
        games: library::list_library()?,
    })
}

/// A lista de jogos vem SEMPRE da biblioteca indexada do próprio servidor
/// (não da de quem está pedindo) — é o servidor quem vai rodar o RetroArch
/// host de verdade (Fase 3/#005), precisa ter o arquivo local.
pub fn create_room(
    rooms: &Rooms,
    rom_path: String,
    nickname: String,
    player_id: String,
    tx: UnboundedSender<Message>,
) -> Result<String, String> {
    let game = library::list_library()?
        .into_iter()
        .find(|g| g.path == rom_path)
        .ok_or_else(|| format!("Jogo não encontrado na biblioteca do servidor: {rom_path}"))?;
    let max_players = max_players_for(&rom_path)?;

    let mut rooms_guard = rooms.lock().map_err(|_| lock_err())?;
    let code = generate_code(&rooms_guard);

    let room = Room {
        code: code.clone(),
        game,
        max_players,
        players: vec![Player {
            id: player_id,
            nickname,
            ready: false,
            tx,
        }],
    };

    broadcast(&room);
    rooms_guard.insert(code.clone(), room);
    Ok(code)
}

pub fn join_room(
    rooms: &Rooms,
    code: &str,
    nickname: String,
    player_id: String,
    tx: UnboundedSender<Message>,
) -> Result<(), String> {
    let mut rooms_guard = rooms.lock().map_err(|_| lock_err())?;
    let room = rooms_guard
        .get_mut(code)
        .ok_or_else(|| format!("Sala \"{code}\" não existe"))?;

    if room.players.len() as i64 >= room.max_players {
        return Err(format!("Sala \"{code}\" já está cheia"));
    }

    room.players.push(Player {
        id: player_id,
        nickname,
        ready: false,
        tx,
    });
    broadcast(room);
    Ok(())
}

pub fn set_ready(rooms: &Rooms, code: &str, player_id: &str, ready: bool) -> Result<(), String> {
    let mut rooms_guard = rooms.lock().map_err(|_| lock_err())?;
    let room = rooms_guard
        .get_mut(code)
        .ok_or_else(|| format!("Sala \"{code}\" não existe"))?;

    let player = room
        .players
        .iter_mut()
        .find(|p| p.id == player_id)
        .ok_or_else(|| "Você não está nessa sala".to_string())?;
    player.ready = ready;

    broadcast(room);
    Ok(())
}

/// Chamado quando a conexão cai. Sala vazia é descartada; sala com gente
/// ainda dentro recebe o `RoomState` atualizado.
pub fn remove_player(rooms: &Rooms, code: &str, player_id: &str) {
    let Ok(mut rooms_guard) = rooms.lock() else {
        return;
    };
    let Some(room) = rooms_guard.get_mut(code) else {
        return;
    };

    room.players.retain(|p| p.id != player_id);

    if room.players.is_empty() {
        rooms_guard.remove(code);
    } else {
        broadcast(room);
    }
}
