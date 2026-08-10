// Impede que uma janela de console apareça no Windows em builds release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod launcher;
mod library;
mod scanner;
mod systems;

use launcher::launch_emulator;
use library::{get_system_configs, list_library, reindex_library, save_system_configs};
use systems::list_systems;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            launch_emulator,
            list_systems,
            get_system_configs,
            save_system_configs,
            reindex_library,
            list_library
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação Tauri");
}
