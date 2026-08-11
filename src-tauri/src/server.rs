use crate::lobby::{self, Rooms};
use crate::protocol::{ClientMessage, ServerMessage};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use std::net::SocketAddr;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

/// Porta do servidor de lobby — arbitrária, mas fixa e documentada. Diferente
/// da porta padrão de netplay do RetroArch (55435) pra não confundir os dois
/// protocolos: essa aqui é só o WebSocket de coordenação (sala, prontidão,
/// atribuição de porta); o RetroArch em si continua indo pela porta dele.
const PORT: u16 = 7777;

/// Modo servidor dedicado (IDEAS.md #007), `--server`, sem Tauri — cria o
/// próprio runtime async em `main.rs` porque não tem nenhum rodando ainda.
pub async fn run() {
    let listener = bind_listener().await;
    let rooms: Rooms = lobby::new_rooms();
    println!("Servidor de lobby escutando em 0.0.0.0:{PORT}");
    accept_loop(listener, rooms).await;
}

async fn bind_listener() -> TcpListener {
    let addr = format!("0.0.0.0:{PORT}");
    TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("não consegui abrir a porta {PORT} do servidor de lobby: {e}"))
}

/// Loop de aceitar conexões em si — reusado tanto pelo modo `--server`
/// dedicado quanto pelo modo embutido (IDEAS.md #008, ver `ensure_embedded_running`).
async fn accept_loop(listener: TcpListener, rooms: Rooms) {
    while let Ok((stream, peer_addr)) = listener.accept().await {
        tokio::spawn(handle_connection(stream, peer_addr, rooms.clone()));
    }
}

/// Só existe quando o "Host" cai no fallback local (servidor dedicado
/// offline/não configurado) — nesse caso a própria instância desktop vira
/// lobby + host, sem precisar de um segundo processo. `OnceLock` porque só
/// deve subir uma vez por execução do app; cliques repetidos em "Host"
/// reusam a mesma instância.
static EMBEDDED_ROOMS: OnceLock<Rooms> = OnceLock::new();

/// Sobe o lobby embutido se ainda não estiver rodando (idempotente) e
/// devolve o `Rooms` compartilhado, pra quem chamou poder criar a sala
/// direto em seguida. Roda dentro do runtime async que o Tauri já mantém —
/// diferente do `run()` acima, não precisa (e não pode) criar outro runtime.
pub async fn ensure_embedded_running() -> Result<Rooms, String> {
    if let Some(rooms) = EMBEDDED_ROOMS.get() {
        return Ok(rooms.clone());
    }

    let listener = TcpListener::bind(format!("0.0.0.0:{PORT}"))
        .await
        .map_err(|e| format!("não consegui abrir a porta {PORT} pro lobby local: {e}"))?;

    let rooms: Rooms = lobby::new_rooms();
    // Corrida entre dois cliques rápidos em "Host": só um dos dois vence o
    // `set`, o outro descarta o listener que acabou de abrir e usa o rooms
    // que já ganhou — evita dois listeners na mesma porta.
    if EMBEDDED_ROOMS.set(rooms.clone()).is_err() {
        drop(listener);
        return Ok(EMBEDDED_ROOMS.get().expect("acabou de checar que existe").clone());
    }

    println!("Lobby embutido escutando em 0.0.0.0:{PORT} (servidor dedicado offline/não configurado)");
    tokio::spawn(accept_loop(listener, rooms.clone()));
    Ok(rooms)
}

/// Tenta um handshake WebSocket rápido no servidor dedicado configurado —
/// só pra saber se está de pé, não manda nenhuma mensagem de verdade.
/// Timeout curto de propósito: essa checagem acontece toda vez que alguém
/// clica "Host", não pode travar a UI esperando uma máquina desligada.
#[tauri::command]
pub async fn check_server_online(host: String) -> bool {
    let url = format!("ws://{host}:{PORT}");
    tokio::time::timeout(Duration::from_secs(2), tokio_tungstenite::connect_async(&url))
        .await
        .map(|r| r.is_ok())
        .unwrap_or(false)
}

/// Resolve qual endereço o "Host"/"Cliente" deve usar pra falar com o lobby
/// (IDEAS.md #008): servidor dedicado configurado e online, se existir e
/// responder; senão sobe (ou reusa) o lobby embutido nessa própria máquina
/// e devolve "127.0.0.1". O front-end usa o resultado pra abrir o
/// WebSocket normal (`useLobbyClient`) — o protocolo é o mesmo dos dois
/// jeitos, só muda pra quem conecta.
#[tauri::command]
pub async fn resolve_lobby_host() -> Result<String, String> {
    if let Some(configured) = crate::settings::get_dedicated_server_host()? {
        if check_server_online(configured.clone()).await {
            return Ok(configured);
        }
    }

    ensure_embedded_running().await?;
    Ok("127.0.0.1".to_string())
}

fn generate_player_id() -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..8).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect()
}

async fn handle_connection(stream: TcpStream, peer_addr: SocketAddr, rooms: Rooms) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("handshake WebSocket falhou com {peer_addr}: {e}");
            return;
        }
    };

    println!("Cliente conectado: {peer_addr}");
    let (mut write, mut read) = ws_stream.split();

    // Outras conexões broadcastam pra essa aqui escrevendo nesse canal — o
    // `rx` é drenado no select! abaixo junto com a leitura, é o padrão
    // consolidado do tokio-tungstenite pra esse cenário (várias conexões
    // precisando mandar mensagem umas pras outras).
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let player_id = generate_player_id();
    let mut current_room: Option<String> = None;

    loop {
        tokio::select! {
            incoming = read.next() => {
                let Some(Ok(msg)) = incoming else { break };
                if msg.is_close() { break; }
                if !msg.is_text() { continue; }

                let response = match serde_json::from_str::<ClientMessage>(msg.to_text().unwrap_or_default()) {
                    Ok(ClientMessage::ListGames) => {
                        Some(lobby::list_games().unwrap_or_else(|e| ServerMessage::Error { message: e }))
                    }
                    Ok(ClientMessage::CreateRoom { game_name, game_system, nickname }) => {
                        match lobby::create_room(&rooms, game_name, game_system, nickname, player_id.clone(), tx.clone()) {
                            // o RoomState em si já foi anunciado via broadcast (chega pelo rx
                            // logo em seguida) — isso aqui só avisa quem é "eu" nele.
                            Ok(code) => {
                                current_room = Some(code);
                                Some(ServerMessage::Joined { player_id: player_id.clone() })
                            }
                            Err(e) => Some(ServerMessage::Error { message: e }),
                        }
                    }
                    Ok(ClientMessage::JoinRoom { code, nickname }) => {
                        match lobby::join_room(&rooms, &code, nickname, player_id.clone(), tx.clone()) {
                            Ok(()) => {
                                current_room = Some(code);
                                Some(ServerMessage::Joined { player_id: player_id.clone() })
                            }
                            Err(e) => Some(ServerMessage::Error { message: e }),
                        }
                    }
                    Ok(ClientMessage::SetReady { ready }) => match &current_room {
                        Some(code) => match lobby::set_ready(&rooms, code, &player_id, ready) {
                            Ok(start) => {
                                // ensure_retroarch_installed pode levar minutos (primeira vez
                                // na máquina) — roda numa task separada, fora do lock das salas.
                                if let Some((game, max_players)) = start {
                                    tokio::spawn(lobby::start_match(rooms.clone(), code.clone(), game, max_players));
                                }
                                None
                            }
                            Err(e) => Some(ServerMessage::Error { message: e }),
                        },
                        None => Some(ServerMessage::Error {
                            message: "Você ainda não está em nenhuma sala".into(),
                        }),
                    },
                    Err(e) => Some(ServerMessage::Error {
                        message: format!("mensagem inválida: {e}"),
                    }),
                };

                if let Some(response) = response {
                    let text = serde_json::to_string(&response).unwrap_or_default();
                    if write.send(Message::text(text)).await.is_err() {
                        break;
                    }
                }
            }
            Some(outgoing) = rx.recv() => {
                if write.send(outgoing).await.is_err() {
                    break;
                }
            }
        }
    }

    if let Some(code) = current_room {
        lobby::remove_player(&rooms, &code, &player_id);
    }
    println!("Cliente desconectado: {peer_addr}");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::ServerMessage;
    use tokio_tungstenite::connect_async;

    async fn connect() -> tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>> {
        let (ws, _) = connect_async(format!("ws://127.0.0.1:{PORT}"))
            .await
            .expect("deveria conseguir conectar no servidor de teste");
        ws
    }

    #[tokio::test]
    async fn cria_sala_entra_e_marca_pronto() {
        tokio::spawn(run());
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        // Precisa de pelo menos um jogo real na biblioteca local pra testar
        // create_room — reusa a mesma base SQLite que os outros testes do
        // projeto já usam (sem mock). Se não tiver nenhum jogo indexado,
        // pula o teste em vez de falhar por falta de dado de ambiente.
        let games = crate::library::list_library().expect("list_library não deveria falhar");
        let Some(game) = games.first() else {
            eprintln!("nenhum jogo indexado na biblioteca local — pulando teste");
            return;
        };

        let mut host_ws = connect().await;
        host_ws
            .send(Message::text(
                serde_json::to_string(&serde_json::json!({
                    "type": "create_room",
                    "game_name": game.name,
                    "game_system": game.system,
                    "nickname": "Bruno",
                }))
                .unwrap(),
            ))
            .await
            .unwrap();

        let joined = host_ws.next().await.unwrap().unwrap();
        let ServerMessage::Joined { player_id: host_player_id } =
            serde_json::from_str(joined.to_text().unwrap()).unwrap()
        else {
            panic!("esperava Joined logo após create_room");
        };
        assert!(!host_player_id.is_empty());

        let response = host_ws.next().await.unwrap().unwrap();
        let parsed: ServerMessage = serde_json::from_str(response.to_text().unwrap()).unwrap();
        let ServerMessage::RoomState { code, players, .. } = parsed else {
            panic!("esperava RoomState, veio outra coisa: {response:?}");
        };
        assert_eq!(players.len(), 1);
        assert_eq!(players[0].nickname, "Bruno");
        assert_eq!(players[0].id, host_player_id);

        let mut guest_ws = connect().await;
        guest_ws
            .send(Message::text(
                serde_json::to_string(&serde_json::json!({
                    "type": "join_room",
                    "code": code,
                    "nickname": "Amigo",
                }))
                .unwrap(),
            ))
            .await
            .unwrap();

        // guest recebe Joined primeiro (só pra ele, não é broadcast)
        let guest_joined = guest_ws.next().await.unwrap().unwrap();
        let ServerMessage::Joined { .. } = serde_json::from_str(guest_joined.to_text().unwrap()).unwrap()
        else {
            panic!("esperava Joined no guest após join_room");
        };

        // host recebe o RoomState atualizado (broadcast do join)
        let host_update = host_ws.next().await.unwrap().unwrap();
        let ServerMessage::RoomState { players, .. } =
            serde_json::from_str(host_update.to_text().unwrap()).unwrap()
        else {
            panic!("esperava RoomState no host após join");
        };
        assert_eq!(players.len(), 2);

        // guest também recebe o RoomState (broadcast, chega depois do Joined)
        let guest_update = guest_ws.next().await.unwrap().unwrap();
        let ServerMessage::RoomState { players, .. } =
            serde_json::from_str(guest_update.to_text().unwrap()).unwrap()
        else {
            panic!("esperava RoomState no guest após join");
        };
        assert_eq!(players.len(), 2);

        guest_ws
            .send(Message::text(
                serde_json::to_string(&serde_json::json!({ "type": "set_ready", "ready": true }))
                    .unwrap(),
            ))
            .await
            .unwrap();

        let ready_update = host_ws.next().await.unwrap().unwrap();
        let ServerMessage::RoomState { players, .. } =
            serde_json::from_str(ready_update.to_text().unwrap()).unwrap()
        else {
            panic!("esperava RoomState após set_ready");
        };
        let guest_player = players.iter().find(|p| p.nickname == "Amigo").unwrap();
        assert!(guest_player.ready);
    }

    /// Dispara o RetroArch host de verdade (Fase 5c) — não roda em `cargo
    /// test` normal, só sob demanda (`cargo test -- --ignored --nocapture`).
    /// Mesmo padrão dos testes "de verdade" de retroarch.rs/igdb.rs.
    #[tokio::test]
    #[ignore]
    async fn sala_cheia_e_pronta_dispara_o_host() {
        tokio::spawn(run());
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let games = crate::library::list_library().expect("list_library não deveria falhar");
        let Some(game) = games.first() else {
            eprintln!("nenhum jogo indexado na biblioteca local — pulando teste");
            return;
        };

        let mut host_ws = connect().await;
        host_ws
            .send(Message::text(
                serde_json::to_string(&serde_json::json!({
                    "type": "create_room",
                    "game_name": game.name,
                    "game_system": game.system,
                    "nickname": "Bruno",
                }))
                .unwrap(),
            ))
            .await
            .unwrap();
        host_ws.next().await.unwrap().unwrap(); // Joined
        let response = host_ws.next().await.unwrap().unwrap();
        let ServerMessage::RoomState { code, max_players, .. } =
            serde_json::from_str(response.to_text().unwrap()).unwrap()
        else {
            panic!("esperava RoomState");
        };

        let mut guest_ws = connect().await;
        guest_ws
            .send(Message::text(
                serde_json::to_string(&serde_json::json!({
                    "type": "join_room",
                    "code": code,
                    "nickname": "Amigo",
                }))
                .unwrap(),
            ))
            .await
            .unwrap();
        guest_ws.next().await.unwrap().unwrap(); // Joined
        host_ws.next().await.unwrap().unwrap(); // host vê o join
        guest_ws.next().await.unwrap().unwrap(); // guest vê a própria confirmação

        // Se o jogo escolhido pedir mais de 2 jogadores (Multitap), esse
        // teste só valida com 2 mesmo assim — cheio o suficiente pra disparar
        // seria preciso mais conexões; o importante aqui é confirmar que o
        // disparo do host acontece quando a sala completa.
        if max_players != 2 {
            eprintln!("jogo escolhido pede {max_players} jogadores, não 2 — pulando teste (escolha determinística seria mais robusta, mas não crítico aqui)");
            return;
        }

        host_ws
            .send(Message::text(
                serde_json::to_string(&serde_json::json!({ "type": "set_ready", "ready": true })).unwrap(),
            ))
            .await
            .unwrap();
        host_ws.next().await.unwrap().unwrap(); // host vê a própria confirmação
        guest_ws.next().await.unwrap().unwrap(); // guest vê o host pronto

        guest_ws
            .send(Message::text(
                serde_json::to_string(&serde_json::json!({ "type": "set_ready", "ready": true })).unwrap(),
            ))
            .await
            .unwrap();

        // essa mensagem que interessa: RoomState (todos prontos) seguido de MatchStarting
        let room_state_msg = host_ws.next().await.unwrap().unwrap();
        let _: ServerMessage = serde_json::from_str(room_state_msg.to_text().unwrap()).unwrap();

        let match_starting_msg = host_ws.next().await.unwrap().unwrap();
        let parsed: ServerMessage = serde_json::from_str(match_starting_msg.to_text().unwrap()).unwrap();
        let ServerMessage::MatchStarting { host_port, system, game_name } = parsed else {
            panic!("esperava MatchStarting, veio: {parsed:?}");
        };

        assert_eq!(host_port, 55435);
        assert_eq!(system, game.system);
        assert_eq!(game_name, game.name);

        println!("RetroArch host disparado de verdade — system={system} game={game_name} port={host_port}");
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        // limpeza: mata o processo real que subiu, senão fica um RetroArch
        // órfão rodando na máquina depois do teste
        let _ = std::process::Command::new("pkill")
            .args(["-f", "RetroArch-Linux-x86_64.AppImage"])
            .output();
    }
}
