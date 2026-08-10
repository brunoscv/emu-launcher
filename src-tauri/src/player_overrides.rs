use crate::db;
use rusqlite::params;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct PlayerCount {
    pub rom_path: String,
    pub max_players: i64,
}

/// Valor efetivo por jogo pra UI mostrar: override manual vence, senão usa o
/// resultado automático do IGDB (`enrich_player_counts`), senão assume 2. Só
/// retorna quem tem mais de 2 — a lista inteira não precisa saber disso, é
/// tudo "2 jogadores" por padrão.
#[tauri::command]
pub fn get_player_counts() -> Result<Vec<PlayerCount>, String> {
    let conn = db::connect()?;
    let mut stmt = conn
        .prepare(
            "SELECT g.rom_path, COALESCE(o.max_players, a.max_players, 2) AS effective
             FROM games g
             LEFT JOIN game_player_overrides o ON o.rom_path = g.rom_path
             LEFT JOIN game_player_auto a ON a.rom_path = g.rom_path
             WHERE COALESCE(o.max_players, a.max_players, 2) > 2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(PlayerCount {
                rom_path: row.get(0)?,
                max_players: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// `max_players <= 2` remove o override (2 é o padrão assumido pra quem não
/// tem linha na tabela — não precisa gravar o caso comum).
#[tauri::command]
pub fn save_player_override(rom_path: String, max_players: i64, uses_multitap: bool) -> Result<(), String> {
    let conn = db::connect()?;

    if max_players <= 2 {
        conn.execute(
            "DELETE FROM game_player_overrides WHERE rom_path = ?1",
            params![rom_path],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    conn.execute(
        "INSERT INTO game_player_overrides (rom_path, max_players, uses_multitap)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(rom_path) DO UPDATE SET max_players = ?2, uses_multitap = ?3",
        params![rom_path, max_players, uses_multitap as i64],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
