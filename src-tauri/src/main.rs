// Impede que uma janela de console apareça no Windows em builds release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod igdb;
mod launcher;
mod library;
mod lobby;
mod player_overrides;
mod protocol;
mod retroarch;
mod scanner;
mod server;
mod settings;
mod systems;

use igdb::enrich_player_counts;
use launcher::launch_emulator;
use library::{get_system_configs, list_library, reindex_library, save_system_configs};
use player_overrides::{get_player_counts, save_player_override};
use retroarch::ensure_retroarch_installed;
use server::{check_server_online, resolve_lobby_host};
use settings::{get_dedicated_server_host, save_dedicated_server_host};
use systems::list_systems;

fn main() {
    // .env vive na raiz do projeto (um nível acima do Cargo.toml, em
    // src-tauri/) — credenciais do IGDB (ver igdb.rs). `.ok()` porque em uma
    // instalação de um amigo esse arquivo não existe, e tudo bem: a busca
    // automática só fica indisponível, o override manual continua ok.
    dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env")).ok();

    // Modo servidor (Fase 5, IDEAS.md #007) — pula o Tauri/GTK inteiramente.
    // O PC dedicado pode não ter monitor nenhum plugado, e o Tauri normal
    // precisa de um display (X11/Wayland) só pra inicializar a janela, mesmo
    // escondida. Cria o runtime async manualmente aqui (em vez de
    // `#[tokio::main]` no main() inteiro) porque o `tauri::Builder::run`
    // abaixo já gerencia o próprio runtime por baixo — os dois juntos dariam
    // o erro clássico do Tokio "cannot start a runtime from within a runtime".
    if std::env::args().any(|arg| arg == "--server") {
        tokio::runtime::Runtime::new()
            .expect("não consegui iniciar o runtime assíncrono do modo servidor")
            .block_on(server::run());
        return;
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            launch_emulator,
            list_systems,
            get_system_configs,
            save_system_configs,
            reindex_library,
            list_library,
            ensure_retroarch_installed,
            get_player_counts,
            save_player_override,
            enrich_player_counts,
            check_server_online,
            resolve_lobby_host,
            get_dedicated_server_host,
            save_dedicated_server_host
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação Tauri");
}
