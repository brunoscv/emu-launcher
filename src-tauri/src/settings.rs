use crate::db;

const DEDICATED_SERVER_HOST_KEY: &str = "dedicated_server_host";

/// Endereço do "meu servidor" (IDEAS.md #008) — quando configurado, é o
/// primeiro alvo que "Host" tenta antes de cair pro modo embutido local.
/// `None` = nunca configurado, cai direto pro modo embutido sem tentar rede.
#[tauri::command]
pub fn get_dedicated_server_host() -> Result<Option<String>, String> {
    let conn = db::connect()?;
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [DEDICATED_SERVER_HOST_KEY],
        |row| row.get::<_, String>(0),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.to_string()),
    })
}

#[tauri::command]
pub fn save_dedicated_server_host(host: String) -> Result<(), String> {
    let conn = db::connect()?;
    let trimmed = host.trim();
    if trimmed.is_empty() {
        conn.execute(
            "DELETE FROM app_settings WHERE key = ?1",
            [DEDICATED_SERVER_HOST_KEY],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [DEDICATED_SERVER_HOST_KEY, trimmed],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
