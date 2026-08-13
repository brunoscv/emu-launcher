// Impede que uma janela de console apareça no Windows em builds release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod igdb;
mod keyboard_config;
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
mod tailscale_install;

use igdb::enrich_player_counts;
use keyboard_config::write_keyboard_config;
use launcher::{kill_emulator, launch_emulator, open_retroarch};
use library::{get_system_configs, list_library, read_cover_image, reindex_library, save_system_configs};
use player_overrides::{get_player_counts, save_player_override};
use retroarch::{ensure_retroarch_installed, install_retroarch_with_progress, is_retroarch_installed};
use server::{check_server_online, resolve_lobby_host};
use settings::{
    get_dedicated_server_host, get_local_lan_ip, get_public_host_address, get_tailscale_ip,
    save_dedicated_server_host, save_public_host_address,
};
use systems::list_systems;
use tailscale_install::{ensure_tailscale_installed, is_tailscale_installed};

fn main() {
    // .env vive na raiz do projeto (um nível acima do Cargo.toml, em
    // src-tauri/) — credenciais do IGDB (ver igdb.rs). `.ok()` porque em uma
    // instalação de um amigo esse arquivo não existe, e tudo bem: a busca
    // automática só fica indisponível, o override manual continua ok.
    dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env")).ok();

    // Ctrl+C (ou kill/fechar terminal) matava só esse processo — o
    // AppImage do RetroArch se desgruda da sessão do terminal de
    // propósito (é assim que ele sobrevive o terminal fechar), então
    // ficava órfão rodando pra sempre, segurando a porta 55435 e
    // confundindo a próxima rodada de teste (bug real descoberto
    // 11/08/2026, ver `launcher::kill_all_spawned`). Cobre os dois modos
    // (desktop e `--server`), já que o registro é global.
    ctrlc::set_handler(|| {
        launcher::kill_all_spawned();
        std::process::exit(0);
    })
    .expect("não consegui registrar o handler de Ctrl+C");

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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            launch_emulator,
            list_systems,
            get_system_configs,
            save_system_configs,
            reindex_library,
            list_library,
            read_cover_image,
            ensure_retroarch_installed,
            is_retroarch_installed,
            install_retroarch_with_progress,
            get_player_counts,
            save_player_override,
            enrich_player_counts,
            check_server_online,
            resolve_lobby_host,
            get_dedicated_server_host,
            save_dedicated_server_host,
            get_public_host_address,
            save_public_host_address,
            get_local_lan_ip,
            get_tailscale_ip,
            is_tailscale_installed,
            ensure_tailscale_installed,
            write_keyboard_config,
            kill_emulator,
            open_retroarch
        ])
        .build(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação Tauri")
        .run(|_app_handle, event| {
            // Mesma limpeza do Ctrl+C, mas pro caminho de fechar a janela
            // normalmente (clicar no X) — os dois precisam matar os
            // processos órfãos, só disparam de jeitos diferentes.
            if let tauri::RunEvent::Exit = event {
                launcher::kill_all_spawned();
            }
        });
}
