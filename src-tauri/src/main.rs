// Impede que uma janela de console apareça no Windows em builds release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod igdb;
mod launcher;
mod library;
mod player_overrides;
mod retroarch;
mod scanner;
mod systems;

use igdb::enrich_player_counts;
use launcher::launch_emulator;
use library::{get_system_configs, list_library, reindex_library, save_system_configs};
use player_overrides::{get_player_counts, save_player_override};
use retroarch::ensure_retroarch_installed;
use systems::list_systems;

fn main() {
    // .env vive na raiz do projeto (um nível acima do Cargo.toml, em
    // src-tauri/) — credenciais do IGDB (ver igdb.rs). `.ok()` porque em uma
    // instalação de um amigo esse arquivo não existe, e tudo bem: a busca
    // automática só fica indisponível, o override manual continua ok.
    dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env")).ok();

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
            enrich_player_counts
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação Tauri");
}
