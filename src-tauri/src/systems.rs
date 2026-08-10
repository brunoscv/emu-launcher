use crate::retroarch;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemDefinition {
    pub id: String,
    pub display_name: String,
    pub emulator_path: String,
    pub extra_args: Vec<String>,
}

fn core_extension() -> &'static str {
    if cfg!(windows) {
        "dll"
    } else {
        "so"
    }
}

fn core_path(cores_dir: &str, core_name: &str) -> String {
    Path::new(cores_dir)
        .join(format!("{core_name}_libretro.{}", core_extension()))
        .to_string_lossy()
        .to_string()
}

/// MVP: mapeamento sistema→core ainda hardcoded (trocar depois por um
/// systems.json editável na tela de configurações). Os caminhos de
/// `emulator_path`/`extra_args` agora apontam pra instalação gerenciada pelo
/// app (ver `retroarch.rs`), não mais pro RetroArch/cores "do sistema" —
/// garante que todo mundo (Bruno + amigos) roda a mesma versão, requisito do
/// netplay. Os caminhos são calculados aqui mesmo sem exigir que o arquivo já
/// exista; cabe ao `ensure_retroarch_installed` (chamado antes de jogar)
/// garantir que ele realmente esteja lá.
#[tauri::command]
pub fn list_systems() -> Result<Vec<SystemDefinition>, String> {
    let installation = retroarch::expected_installation()?;
    let emulator_path = installation.executable_path;
    let cores_dir = installation.cores_dir;

    Ok(vec![
        SystemDefinition {
            id: "snes".into(),
            display_name: "Super Nintendo".into(),
            emulator_path: emulator_path.clone(),
            extra_args: vec!["-L".into(), core_path(&cores_dir, "snes9x")],
        },
        SystemDefinition {
            id: "nes".into(),
            display_name: "Nintendo (NES)".into(),
            emulator_path: emulator_path.clone(),
            extra_args: vec!["-L".into(), core_path(&cores_dir, "fceumm")],
        },
        SystemDefinition {
            id: "psx".into(),
            display_name: "PlayStation".into(),
            emulator_path,
            extra_args: vec!["-L".into(), core_path(&cores_dir, "pcsx_rearmed")],
        },
    ])
}
