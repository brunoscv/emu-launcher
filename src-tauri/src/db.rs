use rusqlite::Connection;
use std::path::PathBuf;

/// `~/.local/share/emu-launcher/library.db` (via `dirs::data_dir`, respeita
/// XDG_DATA_HOME se estiver setado). Ver IDEAS.md #002.
fn db_path() -> Result<PathBuf, String> {
    let mut dir = dirs::data_dir().ok_or("Não foi possível localizar o diretório de dados do usuário")?;
    dir.push("emu-launcher");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push("library.db");
    Ok(dir)
}

/// Abre a conexão e garante que o schema existe. Sem migrations de verdade
/// por enquanto — só `CREATE TABLE IF NOT EXISTS`, suficiente pro estágio
/// atual do projeto (schema ainda não teve nenhuma versão publicada).
pub fn connect() -> Result<Connection, String> {
    let conn = Connection::open(db_path()?).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS system_configs (
            system_id TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL DEFAULT 0,
            rom_folder TEXT
        );

        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            system TEXT NOT NULL,
            rom_path TEXT NOT NULL UNIQUE,
            extension TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            cover_path TEXT,
            last_indexed_at TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;

    Ok(conn)
}
