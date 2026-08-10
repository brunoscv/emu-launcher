use crate::lobby::{self, Rooms};
use crate::protocol::{ClientMessage, ServerMessage};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

/// Porta do servidor de lobby — arbitrária, mas fixa e documentada. Diferente
/// da porta padrão de netplay do RetroArch (55435) pra não confundir os dois
/// protocolos: essa aqui é só o WebSocket de coordenação (sala, prontidão,
/// atribuição de porta); o RetroArch em si continua indo pela porta dele.
const PORT: u16 = 7777;

/// Modo servidor (IDEAS.md #007). Fase 5a validou só o transporte; a partir
/// da 5b já fala o protocolo de sala de verdade (`protocol.rs`/`lobby.rs`) —
/// ainda sem disparar RetroArch, isso fica pra um corte seguinte.
pub async fn run() {
    let addr = format!("0.0.0.0:{PORT}");
    let listener = TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("não consegui abrir a porta {PORT} do servidor de lobby: {e}"));

    println!("Servidor de lobby escutando em {addr}");

    let rooms: Rooms = lobby::new_rooms();

    while let Ok((stream, peer_addr)) = listener.accept().await {
        tokio::spawn(handle_connection(stream, peer_addr, rooms.clone()));
    }
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
                    Ok(ClientMessage::CreateRoom { rom_path, nickname }) => {
                        match lobby::create_room(&rooms, rom_path, nickname, player_id.clone(), tx.clone()) {
                            // sucesso já foi anunciado via broadcast (chega pelo rx abaixo)
                            Ok(code) => { current_room = Some(code); None }
                            Err(e) => Some(ServerMessage::Error { message: e }),
                        }
                    }
                    Ok(ClientMessage::JoinRoom { code, nickname }) => {
                        match lobby::join_room(&rooms, &code, nickname, player_id.clone(), tx.clone()) {
                            Ok(()) => { current_room = Some(code); None }
                            Err(e) => Some(ServerMessage::Error { message: e }),
                        }
                    }
                    Ok(ClientMessage::SetReady { ready }) => match &current_room {
                        Some(code) => match lobby::set_ready(&rooms, code, &player_id, ready) {
                            Ok(()) => None,
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
        let rom_path = game.path.clone();

        let mut host_ws = connect().await;
        host_ws
            .send(Message::text(
                serde_json::to_string(&serde_json::json!({
                    "type": "create_room",
                    "rom_path": rom_path,
                    "nickname": "Bruno",
                }))
                .unwrap(),
            ))
            .await
            .unwrap();

        let response = host_ws.next().await.unwrap().unwrap();
        let parsed: ServerMessage = serde_json::from_str(response.to_text().unwrap()).unwrap();
        let ServerMessage::RoomState { code, players, .. } = parsed else {
            panic!("esperava RoomState, veio outra coisa: {response:?}");
        };
        assert_eq!(players.len(), 1);
        assert_eq!(players[0].nickname, "Bruno");

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

        // host recebe o RoomState atualizado (broadcast do join)
        let host_update = host_ws.next().await.unwrap().unwrap();
        let ServerMessage::RoomState { players, .. } =
            serde_json::from_str(host_update.to_text().unwrap()).unwrap()
        else {
            panic!("esperava RoomState no host após join");
        };
        assert_eq!(players.len(), 2);

        // guest também recebe a confirmação da própria entrada
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
}
