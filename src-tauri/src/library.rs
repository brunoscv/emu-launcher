use crate::db;
use crate::scanner::{self, RomEntry};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemConfig {
    pub system_id: String,
    pub enabled: bool,
    pub rom_folder: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ReindexResult {
    pub roms: Vec<RomEntry>,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn get_system_configs() -> Result<Vec<SystemConfig>, String> {
    let conn = db::connect()?;
    let mut stmt = conn
        .prepare("SELECT system_id, enabled, rom_folder FROM system_configs")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SystemConfig {
                system_id: row.get(0)?,
                enabled: row.get::<_, i64>(1)? != 0,
                rom_folder: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Upsert de tudo que vier — a tela de configurações sempre manda o estado
/// completo da lista de consoles conhecidos, não só o que mudou.
#[tauri::command]
pub fn save_system_configs(configs: Vec<SystemConfig>) -> Result<(), String> {
    let mut conn = db::connect()?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for config in &configs {
        tx.execute(
            "INSERT INTO system_configs (system_id, enabled, rom_folder)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(system_id) DO UPDATE SET enabled = ?2, rom_folder = ?3",
            params![config.system_id, config.enabled as i64, config.rom_folder],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())
}

/// Varre, só pros sistemas habilitados com pasta configurada, e atualiza o
/// índice em `games`. Uma pasta ausente vira warning e não impede os outros
/// sistemas de serem reindexados.
#[tauri::command]
pub fn reindex_library() -> Result<ReindexResult, String> {
    let mut conn = db::connect()?;
    let enabled: Vec<SystemConfig> = {
        let mut stmt = conn
            .prepare("SELECT system_id, enabled, rom_folder FROM system_configs WHERE enabled = 1 AND rom_folder IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(SystemConfig {
                    system_id: row.get(0)?,
                    enabled: row.get::<_, i64>(1)? != 0,
                    rom_folder: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    let mut warnings = Vec::new();
    let indexed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for config in &enabled {
        let folder = config.rom_folder.as_deref().unwrap_or_default();
        match scanner::scan_system_folder(&config.system_id, Path::new(folder)) {
            Ok(roms) => {
                tx.execute(
                    "DELETE FROM games WHERE system = ?1",
                    params![config.system_id],
                )
                .map_err(|e| e.to_string())?;

                for rom in &roms {
                    tx.execute(
                        "INSERT INTO games (name, system, rom_path, extension, size_bytes, cover_path, last_indexed_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                         ON CONFLICT(rom_path) DO UPDATE SET
                            name = ?1, system = ?2, extension = ?4, size_bytes = ?5, cover_path = ?6, last_indexed_at = ?7",
                        params![
                            rom.name,
                            rom.system,
                            rom.path,
                            rom.extension,
                            rom.size_bytes as i64,
                            rom.cover_path,
                            indexed_at
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
            Err(e) => warnings.push(format!("{}: {}", config.system_id, e)),
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    let roms = list_library_with_conn(&conn)?;
    Ok(ReindexResult { roms, warnings })
}

#[tauri::command]
pub fn list_library() -> Result<Vec<RomEntry>, String> {
    let conn = db::connect()?;
    list_library_with_conn(&conn)
}

fn list_library_with_conn(conn: &rusqlite::Connection) -> Result<Vec<RomEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name, rom_path, extension, system, size_bytes, cover_path FROM games
             WHERE system IN (SELECT system_id FROM system_configs WHERE enabled = 1)
             ORDER BY system, name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(RomEntry {
                name: row.get(0)?,
                path: row.get(1)?,
                extension: row.get(2)?,
                system: row.get(3)?,
                size_bytes: row.get::<_, i64>(4)? as u64,
                cover_path: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Lê a capa do disco e devolve como data URI — o webview do Tauri não
/// carrega caminho de arquivo local direto num `<img src>` (precisaria do
/// asset protocol com escopo configurado, ver discussão do IDEAS.md #014);
/// mais simples e sem superfície de segurança nova é só ler os bytes aqui e
/// já devolver pronto pra tela. Chamado sob demanda (jogo selecionado na
/// lista), não em lote — imagem de capa é pequena, mas 700+ de uma vez no
/// `list_library` incharia a resposta.
#[tauri::command]
pub fn read_cover_image(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime = if path.to_lowercase().ends_with(".png") {
        "image/png"
    } else {
        "image/jpeg"
    };
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}
