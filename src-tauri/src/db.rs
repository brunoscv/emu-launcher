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
        );

        -- Override manual de número de jogadores por jogo (IDEAS.md #004).
        -- Só tem linha aqui pra jogos que fogem do padrão de 2 jogadores
        -- (ex: Multitap) — ausência de linha = assume 2. Sempre tem
        -- precedência sobre o valor automático da tabela abaixo.
        CREATE TABLE IF NOT EXISTS game_player_overrides (
            rom_path TEXT PRIMARY KEY,
            max_players INTEGER NOT NULL,
            uses_multitap INTEGER NOT NULL DEFAULT 0
        );

        -- Cache do resultado da busca automática (IGDB). Separado do override
        -- pra distinguir \"nunca verificamos\" de \"verificamos e não achou\":
        -- uma linha aqui sempre existe depois de checar, com max_players NULL
        -- se o IGDB não tinha dado de multiplayer pro jogo — assim
        -- `enrich_player_counts` não fica reconsultando o mesmo jogo sem
        -- multiplayer a cada reindex.
        CREATE TABLE IF NOT EXISTS game_player_auto (
            rom_path TEXT PRIMARY KEY,
            max_players INTEGER,
            checked_at TEXT NOT NULL
        );

        -- Configs simples de chave/valor (IDEAS.md #008) — hoje só guarda o
        -- endereço do servidor dedicado (\"meu servidor\"), mas evita criar uma
        -- tabela nova pra cada config futura de uma linha só.
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;

    Ok(conn)
}
