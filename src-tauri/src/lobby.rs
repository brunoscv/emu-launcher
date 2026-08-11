use crate::launcher;
use crate::library;
use crate::player_overrides;
use crate::protocol::{PlayerView, ServerMessage};
use crate::retroarch;
use crate::scanner::RomEntry;
use crate::systems;
use rand::Rng;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc::UnboundedSender;
use tokio_tungstenite::tungstenite::Message;

/// Porta padrão de netplay do próprio RetroArch (não confundir com a 7777
/// do nosso WebSocket de lobby). Fixa por enquanto — o servidor só hospeda
/// uma partida por vez nesse corte (ver nota em `launch_host`).
const NETPLAY_PORT: u16 = 55435;

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
    pub started: bool,
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

fn broadcast_message(room: &Room, message: &ServerMessage) {
    let text = serde_json::to_string(message).unwrap_or_default();
    for player in &room.players {
        let _ = player.tx.send(Message::text(text.clone()));
    }
}

fn broadcast(room: &Room) {
    broadcast_message(room, &room_state_message(room));
}

fn headless_config_path() -> Result<std::path::PathBuf, String> {
    let mut dir = dirs::data_dir().ok_or("Não foi possível localizar o diretório de dados do usuário")?;
    dir.push("emu-launcher");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push("server_session.cfg");
    Ok(dir)
}

/// `video_driver`/`audio_driver = "null"` pro host rodar sem tela (validado
/// na prática na Fase 3/#005). Multitap do SNES (`input_libretro_device_p2 =
/// "257"`, device id confirmado na documentação) só entra quando o jogo
/// pede mais de 2 jogadores — não faz sentido pra partida 1x1.
/// `config_save_on_exit = "false"` é essencial aqui: sem isso, o RetroArch
/// (comportamento padrão) salva o config efetivo de volta no retroarch.cfg
/// COMPARTILHADO ao fechar — vazando esses drivers "null" pro cliente
/// também (bug real encontrado: primeira partida da máquina rodou o host
/// headless antes de qualquer cliente, e a config "sem vídeo" virou o
/// padrão pra tudo depois).
fn write_headless_config(max_players: i64) -> Result<std::path::PathBuf, String> {
    let path = headless_config_path()?;
    let mut contents = String::from(
        "video_driver = \"null\"\naudio_driver = \"null\"\nconfig_save_on_exit = \"false\"\n",
    );
    if max_players > 2 {
        contents.push_str("input_libretro_device_p2 = \"257\"\n");
    }
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Baixa/instala o RetroArch se preciso (`ensure_retroarch_installed` —
/// idempotente, só demora de verdade na primeira partida da máquina) e
/// dispara o host. Sempre via `systems::list_systems()`/
/// `retroarch::expected_installation()`, nunca um binário solto do PATH —
/// é a lição que a Fase 3/#005 deixou clara. `async` porque o download
/// pode levar minutos; por isso quem chama (`start_match`) faz isso FORA
/// do lock das salas (ver nota lá).
///
/// Limitação conhecida deste corte: porta de netplay e arquivo de config
/// são fixos (`NETPLAY_PORT`, `server_session.cfg`) — o servidor hospeda
/// uma partida por vez. Rodar duas salas completando ao mesmo tempo não é
/// suportado ainda; não é o cenário de uso atual (Bruno + amigos numa
/// partida por vez), mas fica registrado pra quando/se importar.
async fn launch_host(game: &RomEntry, max_players: i64) -> Result<u16, String> {
    retroarch::ensure_retroarch_installed().await?;

    let system_def = systems::list_systems()?
        .into_iter()
        .find(|s| s.id == game.system)
        .ok_or_else(|| format!("Nenhum emulador configurado pro sistema \"{}\"", game.system))?;

    let cfg_path = write_headless_config(max_players)?;

    let mut args = system_def.extra_args.clone();
    args.push("--host".to_string());
    args.push("--port".to_string());
    args.push(NETPLAY_PORT.to_string());
    args.push("--appendconfig".to_string());
    args.push(cfg_path.to_string_lossy().to_string());

    launcher::spawn_emulator(&system_def.emulator_path, &game.path, &args, |exit_code| {
        println!("RetroArch host encerrou (exit code {exit_code:?})");
    })?;

    Ok(NETPLAY_PORT)
}

/// Só decide se deve iniciar (sala cheia + todo mundo pronto, e só uma vez
/// — `room.started`), sem fazer nenhum trabalho assíncrono. Devolve o que
/// `start_match` precisa pra disparar de verdade depois, fora do lock.
fn maybe_start_match(room: &mut Room) -> Option<(RomEntry, i64)> {
    if room.started {
        return None;
    }
    if (room.players.len() as i64) < room.max_players {
        return None;
    }
    if !room.players.iter().all(|p| p.ready) {
        return None;
    }

    room.started = true;
    Some((room.game.clone(), room.max_players))
}

/// Dispara o host de verdade — chamado FORA do lock das salas (o
/// `ensure_retroarch_installed` dentro de `launch_host` pode levar minutos
/// baixando na primeira vez; segurar o `std::sync::Mutex` das salas por
/// tanto tempo travaria toda e qualquer outra sala do servidor). Rebloqueia
/// só no final, pra anunciar o resultado.
pub async fn start_match(rooms: Rooms, code: String, game: RomEntry, max_players: i64) {
    let result = launch_host(&game, max_players).await;

    let Ok(mut rooms_guard) = rooms.lock() else {
        return;
    };
    let Some(room) = rooms_guard.get_mut(&code) else {
        return; // sala sumiu (todo mundo saiu) enquanto o RetroArch instalava
    };

    match result {
        Ok(host_port) => broadcast_message(
            room,
            &ServerMessage::MatchStarting {
                host_port,
                system: game.system,
                game_name: game.name,
            },
        ),
        Err(e) => {
            room.started = false; // permite tentar de novo (ex: desmarca e marca pronto de novo)
            broadcast_message(room, &ServerMessage::Error { message: e });
        }
    }
}

pub fn list_games() -> Result<ServerMessage, String> {
    Ok(ServerMessage::GamesList {
        games: library::list_library()?,
    })
}

/// A lista de jogos vem SEMPRE da biblioteca indexada do próprio servidor
/// (não da de quem está pedindo) — é o servidor quem vai rodar o RetroArch
/// host de verdade (Fase 3/#005), precisa ter o arquivo local. Resolvido por
/// nome+sistema (IDEAS.md #008), não por path exato — quem cria a sala pode
/// estar numa máquina diferente da do servidor (o botão "Host" delega pro
/// servidor dedicado quando ele está online), com a mesma rom numa pasta
/// diferente lá.
pub fn create_room(
    rooms: &Rooms,
    game_name: String,
    game_system: String,
    nickname: String,
    player_id: String,
    tx: UnboundedSender<Message>,
) -> Result<String, String> {
    let game = library::list_library()?
        .into_iter()
        .find(|g| g.name == game_name && g.system == game_system)
        .ok_or_else(|| format!("Jogo \"{game_name}\" não encontrado na biblioteca do servidor"))?;
    let max_players = max_players_for(&game.path)?;

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
        started: false,
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

/// `Ok(Some((game, max_players)))` quando essa chamada foi a que completou a
/// sala — quem chama deve disparar `start_match` com isso, fora de
/// qualquer lock (ver `start_match`).
pub fn set_ready(
    rooms: &Rooms,
    code: &str,
    player_id: &str,
    ready: bool,
) -> Result<Option<(RomEntry, i64)>, String> {
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
    Ok(maybe_start_match(room))
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
