use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

/// Porta do servidor de lobby — arbitrária, mas fixa e documentada. Diferente
/// da porta padrão de netplay do RetroArch (55435) pra não confundir os dois
/// protocolos: essa aqui é só o WebSocket de coordenação (sala, prontidão,
/// atribuição de porta); o RetroArch em si continua indo pela porta dele.
const PORT: u16 = 7777;

/// Esqueleto do "modo servidor" (Fase 5a do plano de multiplayer, ver
/// IDEAS.md #007) — só prova que o processo sobe sem GUI e aceita conexão
/// WebSocket. Sem sala, sem estado, sem chamar RetroArch ainda; isso vem no
/// próximo corte, depois de confirmar que essa base funciona (inclusive no
/// PC dedicado, sem monitor).
pub async fn run() {
    let addr = format!("0.0.0.0:{PORT}");
    let listener = TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("não consegui abrir a porta {PORT} do servidor de lobby: {e}"));

    println!("Servidor de lobby escutando em {addr}");

    while let Ok((stream, peer_addr)) = listener.accept().await {
        tokio::spawn(async move {
            let ws_stream = match accept_async(stream).await {
                Ok(ws) => ws,
                Err(e) => {
                    eprintln!("handshake WebSocket falhou com {peer_addr}: {e}");
                    return;
                }
            };

            println!("Cliente conectado: {peer_addr}");
            let (mut write, mut read) = ws_stream.split();

            while let Some(Ok(msg)) = read.next().await {
                if msg.is_text() && msg.to_text().unwrap_or_default() == "ping" {
                    if write.send(Message::text("pong")).await.is_err() {
                        break;
                    }
                }
            }

            println!("Cliente desconectado: {peer_addr}");
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_tungstenite::connect_async;

    /// Sobe o servidor de verdade numa task em background e conecta como
    /// cliente real — valida o esqueleto de transporte (Fase 5a) sem
    /// depender de ferramenta externa (nem python nem websocat disponíveis
    /// nessa máquina de dev).
    #[tokio::test]
    async fn responde_pong_pra_ping() {
        tokio::spawn(run());
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let (ws_stream, _) = connect_async(format!("ws://127.0.0.1:{PORT}"))
            .await
            .expect("deveria conseguir conectar no servidor de teste");

        let (mut write, mut read) = ws_stream.split();
        write
            .send(Message::text("ping"))
            .await
            .expect("deveria conseguir mandar ping");

        let response = read
            .next()
            .await
            .expect("deveria receber uma resposta")
            .expect("resposta não devia ser erro");

        assert_eq!(response.to_text().unwrap(), "pong");
    }
}
