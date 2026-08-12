use serde::Serialize;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::process::Command;

/// Mata um processo pelo PID (RetroArch, host ou cliente) — usado tanto
/// pelo command Tauri `kill_emulator` (frontend, "Sair da sala") quanto
/// internamente por `lobby.rs` (host esquecido rodando quando a sala
/// esvazia). Sem retentar `Child` nenhum — `spawn_emulator` já dispara o
/// processo em modo fire-and-forget (só monitora a saída numa task), então
/// matar por PID via comando do SO é mais simples que replumbing pra
/// guardar o `Child` em algum lugar acessível depois.
pub fn kill_pid(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    let result = std::process::Command::new("kill").args(["-9", &pid.to_string()]).output();
    #[cfg(windows)]
    let result = std::process::Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .output();

    result.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_emulator(pid: u32) -> Result<(), String> {
    kill_pid(pid)
}

/// Todo PID que `spawn_emulator` já disparou e ainda não terminou sozinho —
/// existe só pra `kill_all_spawned` (chamado no Ctrl+C/fechamento do app,
/// ver `main.rs`) conseguir limpar tudo de uma vez.
///
/// Bug real descoberto 11/08/2026 (IDEAS.md #009): o AppImage do RetroArch
/// se desgruda da sessão do terminal (é assim que ele sobrevive o terminal
/// fechar) — então Ctrl+C no `npm run tauri dev` matava o nosso processo,
/// mas o RetroArch continuava rodando pra sempre, órfão, segurando a porta
/// 55435. Toda rodada de teste seguinte falhava em abrir a porta e acabava
/// conectando nesse processo zumbi de uma sessão completamente diferente
/// — explicava tanto "o jogo já abre no menu errado" quanto "nada responde
/// ao teclado" (a sessão real nunca tinha ninguém de verdade conectado).
fn spawned_pids() -> &'static Mutex<HashSet<u32>> {
    static PIDS: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();
    PIDS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Mata todo processo que essa instância do app lançou e ainda não fechou
/// sozinho — chamado no handler de Ctrl+C/saída do `main.rs`.
pub fn kill_all_spawned() {
    let pids: Vec<u32> = spawned_pids().lock().map(|s| s.iter().copied().collect()).unwrap_or_default();
    for pid in pids {
        println!("[emu-launcher] encerrando processo órfão pid={pid} (app está fechando)");
        let _ = kill_pid(pid);
    }
}

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
    // Log de investigação (IDEAS.md #009, bug dos controles) — `Command`
    // herda o stdio do processo pai por padrão, então isso (e a saída do
    // próprio RetroArch, se `--verbose` estiver nos args) aparece direto
    // no terminal de quem rodou `npm run tauri dev` ou o binário release.
    println!(
        "[emu-launcher] lançando: {} {} {}",
        emulator_path,
        extra_args.join(" "),
        rom_path
    );

    let mut child = Command::new(emulator_path)
        .args(extra_args)
        .arg(rom_path)
        .spawn()
        .map_err(|e| format!("Falha ao iniciar o emulador '{}': {}", emulator_path, e))?;

    let pid = child.id();
    println!("[emu-launcher] processo iniciado, pid={pid:?}");
    if let Some(pid) = pid {
        if let Ok(mut set) = spawned_pids().lock() {
            set.insert(pid);
        }
    }

    tokio::spawn(async move {
        let status = child.wait().await;
        let exit_code = status.ok().and_then(|s| s.code());
        println!("[emu-launcher] processo pid={pid:?} encerrou (exit code {exit_code:?})");
        if let Some(pid) = pid {
            if let Ok(mut set) = spawned_pids().lock() {
                set.remove(&pid);
            }
        }
        on_exit(exit_code);
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
