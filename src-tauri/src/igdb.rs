use crate::db;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

fn credentials() -> Option<(String, String)> {
    let client_id = std::env::var("IGDB_CLIENT_ID").ok()?;
    let client_secret = std::env::var("IGDB_CLIENT_SECRET").ok()?;
    if client_id.is_empty() || client_secret.is_empty() {
        return None;
    }
    Some((client_id, client_secret))
}

#[derive(Debug, Deserialize)]
struct TwitchTokenResponse {
    access_token: String,
}

async fn fetch_token(client_id: &str, client_secret: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://id.twitch.tv/oauth2/token")
        .query(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Falha ao autenticar no Twitch/IGDB: HTTP {}", response.status()));
    }

    response
        .json::<TwitchTokenResponse>()
        .await
        .map(|t| t.access_token)
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
struct IgdbMultiplayerMode {
    offlinemax: Option<i64>,
    onlinemax: Option<i64>,
    offlinecoopmax: Option<i64>,
    onlinecoopmax: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct IgdbGame {
    #[serde(default)]
    multiplayer_modes: Vec<IgdbMultiplayerMode>,
}

/// Busca o jogo por nome (fuzzy, via `search`) e extrai o maior número de
/// jogadores entre os campos que o `multiplayer_modes` do IGDB expõe.
/// `0`/ausente em cada campo geralmente significa "não se aplica", não
/// "zero jogadores" — por isso filtramos só valores > 0 antes do máximo.
async fn fetch_max_players(client_id: &str, token: &str, game_name: &str) -> Result<Option<i64>, String> {
    let client = reqwest::Client::new();
    let escaped_name = game_name.replace('"', "");
    let body = format!(
        "search \"{escaped_name}\"; fields multiplayer_modes.offlinemax,multiplayer_modes.onlinemax,multiplayer_modes.offlinecoopmax,multiplayer_modes.onlinecoopmax; limit 1;"
    );

    let response = client
        .post("https://api.igdb.com/v4/games")
        .header("Client-ID", client_id)
        .header("Authorization", format!("Bearer {token}"))
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "HTTP {} ao consultar IGDB pra \"{}\"",
            response.status(),
            game_name
        ));
    }

    let games: Vec<IgdbGame> = response.json().await.map_err(|e| e.to_string())?;

    let max_players = games
        .first()
        .into_iter()
        .flat_map(|g| &g.multiplayer_modes)
        .flat_map(|m| [m.offlinemax, m.onlinemax, m.offlinecoopmax, m.onlinecoopmax])
        .flatten()
        .filter(|&n| n > 0)
        .max();

    Ok(max_players)
}

#[derive(Debug, Serialize, Clone)]
pub struct EnrichProgress {
    pub checked: usize,
    pub total: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct EnrichResult {
    pub checked: usize,
    pub found: usize,
}

/// Consulta o IGDB só pros jogos ainda não verificados (cache em
/// `game_player_auto`) — incremental, reindexações futuras só checam jogo
/// novo. Respeita o limite de ~4 req/s do plano gratuito do IGDB com um
/// pequeno delay entre chamadas; numa biblioteca de milhares de jogos isso
/// pode levar minutos na primeira vez — por isso é uma ação separada do
/// `reindex_library`, disparada explicitamente, com progresso emitido por
/// evento (`player-count-progress`) pro frontend poder mostrar andamento.
#[tauri::command]
pub async fn enrich_player_counts(app: AppHandle) -> Result<EnrichResult, String> {
    let (client_id, client_secret) = credentials().ok_or_else(|| {
        "IGDB_CLIENT_ID/IGDB_CLIENT_SECRET não configurados (crie um .env na raiz do projeto)"
            .to_string()
    })?;

    let token = fetch_token(&client_id, &client_secret).await?;

    let pending: Vec<(String, String)> = {
        let conn = db::connect()?;
        let mut stmt = conn
            .prepare(
                "SELECT rom_path, name FROM games
                 WHERE rom_path NOT IN (SELECT rom_path FROM game_player_auto)",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    let total = pending.len();
    let mut checked = 0;
    let mut found = 0;
    let mut had_success = false;

    for (rom_path, name) in pending {
        let result = fetch_max_players(&client_id, &token, &name).await;

        let max_players = match result {
            Ok(v) => v,
            Err(e) if !had_success => return Err(e), // provável erro de config/credencial, aborta cedo
            Err(_) => {
                checked += 1;
                let _ = app.emit("player-count-progress", EnrichProgress { checked, total });
                tokio::time::sleep(Duration::from_millis(300)).await;
                continue; // falha pontual — não grava, tenta de novo numa próxima chamada
            }
        };

        had_success = true;
        if max_players.is_some() {
            found += 1;
        }

        let conn = db::connect()?;
        let checked_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs().to_string())
            .unwrap_or_default();
        conn.execute(
            "INSERT INTO game_player_auto (rom_path, max_players, checked_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(rom_path) DO UPDATE SET max_players = ?2, checked_at = ?3",
            params![rom_path, max_players, checked_at],
        )
        .map_err(|e| e.to_string())?;

        checked += 1;
        let _ = app.emit("player-count-progress", EnrichProgress { checked, total });
        tokio::time::sleep(Duration::from_millis(300)).await;
    }

    Ok(EnrichResult { checked, found })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Faz uma chamada real ao Twitch/IGDB — não roda em `cargo test` normal.
    /// `cargo test -- --ignored --nocapture` pra reverificar manualmente.
    #[tokio::test]
    #[ignore]
    async fn busca_de_verdade_o_superstar_soccer_deluxe() {
        dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env"))
            .expect("crie o .env na raiz do projeto com IGDB_CLIENT_ID/IGDB_CLIENT_SECRET");

        let (client_id, client_secret) = credentials().expect("credenciais IGDB ausentes no .env");
        let token = fetch_token(&client_id, &client_secret)
            .await
            .expect("token deveria ser emitido");

        let max_players = fetch_max_players(&client_id, &token, "International Superstar Soccer Deluxe")
            .await
            .expect("consulta deveria funcionar");

        println!("max_players encontrado: {:?}", max_players);
        assert!(max_players.is_some(), "esperava algum dado de multiplayer pra esse jogo");
    }
}
