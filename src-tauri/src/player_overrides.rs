use crate::db;
use rusqlite::params;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct PlayerCount {
    pub rom_path: String,
    pub max_players: i64,
}

/// Valor efetivo por jogo pra UI mostrar: override manual (botão "✏️ Editar"
/// na `GameList`, IDEAS.md #019 trouxe de volta o controle que o #010 tinha
/// tirado) vence; senão usa o resultado automático do IGDB
/// (`enrich_player_counts`); um jogo já
/// verificado que o IGDB não achou multiplayer nenhum vira `1` (esconde
/// Host/Cliente — ver `GameList.tsx`). Jogo nunca verificado (sem linha em
/// nenhuma das duas tabelas) fica de fora do resultado — quem chama assume
/// 2 pra esse caso (estado desconhecido, não "sabidamente 1 jogador").
#[tauri::command]
pub fn get_player_counts() -> Result<Vec<PlayerCount>, String> {
    let conn = db::connect()?;
    let mut stmt = conn
        .prepare(
            "SELECT g.rom_path, COALESCE(o.max_players, a.max_players, 1) AS effective
             FROM games g
             LEFT JOIN game_player_overrides o ON o.rom_path = g.rom_path
             LEFT JOIN game_player_auto a ON a.rom_path = g.rom_path
             WHERE o.rom_path IS NOT NULL OR a.rom_path IS NOT NULL",
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

/// Grava o override explícito, qualquer valor (1 em diante) — IDEAS.md #019
/// trouxe de volta uma UI pra isso (botão "✏️ Editar" na `GameList`), então
/// precisa suportar corrigir tanto "pra cima" (IGDB errou pra menos) quanto
/// "pra baixo" (ex: forçar 1 jogador num jogo que o IGDB marcou errado como
/// multiplayer). Antes disso só existia o caminho de "pra cima" (valores
/// ≤2 eram descartados, assumindo que 2 já era o padrão razoável) — não
/// dava pra fixar "1 jogador" de propósito por aqui.
#[tauri::command]
pub fn save_player_override(rom_path: String, max_players: i64, uses_multitap: bool) -> Result<(), String> {
    let conn = db::connect()?;

    conn.execute(
        "INSERT INTO game_player_overrides (rom_path, max_players, uses_multitap)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(rom_path) DO UPDATE SET max_players = ?2, uses_multitap = ?3",
        params![rom_path, max_players, uses_multitap as i64],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
