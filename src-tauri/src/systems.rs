use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemDefinition {
    pub id: String,
    pub display_name: String,
    pub emulator_path: String,
    pub extra_args: Vec<String>,
}

/// MVP: retorna uma lista fixa. Trocar depois por leitura de um
/// systems.json em ~/.config/emu-launcher/systems.json, editável
/// pela tela de configurações do frontend (seção 2.4 do plano).
#[tauri::command]
pub fn list_systems() -> Vec<SystemDefinition> {
    vec![
        SystemDefinition {
            id: "snes".into(),
            display_name: "Super Nintendo".into(),
            emulator_path: "retroarch".into(),
            extra_args: vec!["-L".into(), "/usr/lib/x86_64-linux-gnu/libretro/snes9x_libretro.so".into()],
        },
        SystemDefinition {
            id: "nes".into(),
            display_name: "Nintendo (NES)".into(),
            emulator_path: "retroarch".into(),
            extra_args: vec!["-L".into(), "/path/to/fceumm_libretro.so".into()],
        },
        SystemDefinition {
            id: "psx".into(),
            display_name: "PlayStation".into(),
            emulator_path: "retroarch".into(),
            extra_args: vec!["-L".into(), "/path/to/pcsx_rearmed_libretro.so".into()],
        },
    ]
}
