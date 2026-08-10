use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct LaunchResult {
    pub started: bool,
    pub pid: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
struct EmulatorClosedPayload {
    exit_code: Option<i32>,
    rom_path: String,
}

/// Dispara o emulador de forma assíncrona. Como isso roda inteiramente
/// no lado Rust (não via shell plugin do frontend), não precisamos
/// da permissão "shell:allow-execute" do sistema de capabilities do Tauri v2.
///
/// `extra_args` vem do SystemDefinition (systems.rs) e carrega coisas como
/// `-L /caminho/do/core_libretro.so` — sem isso o RetroArch abre sem saber
/// qual core carregar. Os args entram ANTES da rom, que é sempre o
/// último argumento (é assim que o RetroArch espera via linha de comando).
///
/// Emite o evento "emulator-closed" pro frontend saber quando devolver o
/// foco pro launcher (ver App.tsx: listen("emulator-closed", ...)).
#[tauri::command]
pub async fn launch_emulator(
    app: AppHandle,
    emulator_path: String,
    rom_path: String,
    extra_args: Vec<String>,
) -> Result<LaunchResult, String> {
    let mut child = Command::new(&emulator_path)
        .args(&extra_args)
        .arg(&rom_path)
        .spawn()
        .map_err(|e| format!("Falha ao iniciar o emulador '{}': {}", emulator_path, e))?;

    let pid = child.id();
    let rom_path_clone = rom_path.clone();

    // Monitora o processo em background sem bloquear a resposta do comando;
    // o frontend já pode esconder a janela / mostrar "jogo em execução"
    // e só reage de novo quando o evento chegar.
    tauri::async_runtime::spawn(async move {
        let status = child.wait().await;
        let exit_code = status.ok().and_then(|s| s.code());

        let _ = app.emit(
            "emulator-closed",
            EmulatorClosedPayload {
                exit_code,
                rom_path: rom_path_clone,
            },
        );
    });

    Ok(LaunchResult {
        started: true,
        pid,
    })
}