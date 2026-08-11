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

/// Núcleo compartilhado entre o command Tauri (`launch_emulator`, modo
/// desktop) e o servidor de lobby (modo `--server`, sem `AppHandle` — ver
/// `lobby.rs`). `on_exit` decide o que fazer quando o processo fecha: emitir
/// evento pra UI no modo desktop, só logar no servidor.
///
/// `Command::spawn` em si é síncrono e rápido (não precisa de `.await`); só
/// o monitoramento de saída do processo roda numa task em background —
/// por isso essa função não precisa ser `async`, funciona chamada tanto de
/// dentro de um command Tauri quanto de dentro do lock síncrono do lobby.
pub fn spawn_emulator(
    emulator_path: &str,
    rom_path: &str,
    extra_args: &[String],
    on_exit: impl FnOnce(Option<i32>) + Send + 'static,
) -> Result<LaunchResult, String> {
    let mut child = Command::new(emulator_path)
        .args(extra_args)
        .arg(rom_path)
        .spawn()
        .map_err(|e| format!("Falha ao iniciar o emulador '{}': {}", emulator_path, e))?;

    let pid = child.id();

    tokio::spawn(async move {
        let status = child.wait().await;
        on_exit(status.ok().and_then(|s| s.code()));
    });

    Ok(LaunchResult {
        started: true,
        pid,
    })
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
    let rom_path_for_event = rom_path.clone();
    spawn_emulator(&emulator_path, &rom_path, &extra_args, move |exit_code| {
        let _ = app.emit(
            "emulator-closed",
            EmulatorClosedPayload {
                exit_code,
                rom_path: rom_path_for_event,
            },
        );
    })
}
