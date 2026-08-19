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
///
/// Mata o GRUPO de processos inteiro (`-pid` no Unix, `/T` no Windows), não
/// só o PID isolado — bug real encontrado 11-12/08/2026 (IDEAS.md #011): o
/// AppImage do RetroArch faz um segundo processo por baixo (mount FUSE, via
/// fork, não exec-replace) chamado "AppRun"; matando só o PID que
/// `spawn_emulator` guarda (o processo pai/wrapper) esse "AppRun" sobrevivia
/// órfão, segurando a porta 55435 pra sempre e contaminando o teste
/// seguinte com "porta já em uso"/"device já ocupado". `spawn_emulator`
/// (abaixo) já bota o processo no seu próprio grupo (`process_group(0)`)
/// pra isso funcionar.
pub fn kill_pid(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    let result = std::process::Command::new("kill")
        .args(["-9", &format!("-{pid}")])
        .output();
    #[cfg(windows)]
    let result = std::process::Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
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
/// Arquivo onde a saída do RetroArch (`--verbose`, quando presente nos args
/// de netplay — ver `lobby.rs`/`LobbyScreen.tsx`) fica gravada, em vez de só
/// herdada do processo pai. Antes disso, essa saída ficava perdida sempre
/// que o app rodava sem console anexado — que é o caso NORMAL no Windows ao
/// abrir com duplo-clique (sem terminal nenhum, o texto não vai a lugar
/// nenhum), então dos 3 PCs testados numa partida real (19/08/2026,
/// International Superstar Soccer Deluxe com engasgos), os 2 Windows não
/// deixavam rastro nenhum pra investigar depois — só a máquina Linux rodada
/// a partir de um terminal tinha alguma chance de mostrar algo, e mesmo
/// assim só ficava no scrollback do terminal, não em lugar nenhum
/// revisitável. Um arquivo por processo (timestamp no nome) em vez de um
/// log único: partidas antigas não se misturam com a mais recente.
fn open_retroarch_log_file() -> Result<(std::path::PathBuf, std::fs::File, std::fs::File), String> {
    let mut dir = dirs::data_dir().ok_or("Não foi possível localizar o diretório de dados do usuário")?;
    dir.push("emu-launcher");
    dir.push("logs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    dir.push(format!("retroarch-{timestamp}.log"));

    let stdout_file = std::fs::File::create(&dir).map_err(|e| e.to_string())?;
    // Mesmo arquivo pros dois fds (fd duplicado, não um File::create novo) —
    // stdout e stderr do RetroArch ficam intercalados na ordem real em que
    // foram escritos, em vez de virar dois arquivos que precisam ser lidos
    // lado a lado pra reconstruir a sequência de eventos.
    let stderr_file = stdout_file.try_clone().map_err(|e| e.to_string())?;
    Ok((dir, stdout_file, stderr_file))
}

pub fn spawn_emulator(
    emulator_path: &str,
    rom_path: Option<&str>,
    extra_args: &[String],
    on_exit: impl FnOnce(Option<i32>) + Send + 'static,
) -> Result<LaunchResult, String> {
    println!(
        "[emu-launcher] lançando: {} {} {}",
        emulator_path,
        extra_args.join(" "),
        rom_path.unwrap_or("(sem rom — abre no menu do RetroArch)")
    );

    let mut cmd = Command::new(emulator_path);
    cmd.args(extra_args);
    if let Some(rom_path) = rom_path {
        cmd.arg(rom_path);
    }
    // Grupo de processos próprio (pgid = o próprio pid) — sem isso, matar só
    // o PID que a gente guarda não mata o "AppRun" que o AppImage sobe por
    // baixo (ver kill_pid). `-9 -pid` só funciona se pid for líder de grupo.
    #[cfg(unix)]
    cmd.process_group(0);

    match open_retroarch_log_file() {
        Ok((log_path, stdout_file, stderr_file)) => {
            println!("[emu-launcher] log do RetroArch: {}", log_path.display());
            cmd.stdout(stdout_file);
            cmd.stderr(stderr_file);
        }
        Err(e) => {
            println!("[emu-launcher] não consegui abrir arquivo de log ({e}) — saída do RetroArch vai herdada, como antes");
        }
    }

    let mut child = cmd
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
    spawn_emulator(&emulator_path, Some(&rom_path), &extra_args, move |exit_code| {
        let _ = app.emit(
            "emulator-closed",
            EmulatorClosedPayload {
                exit_code,
                rom_path: rom_path_for_event,
            },
        );
    })
}

/// Abre o RetroArch "pelado" — sem rom, sem core, sem nenhum
/// `--appendconfig` nosso (nem o mapeamento de teclado do #009, nem o
/// device request do netplay) — direto no menu principal dele. Pensado pra
/// configurar input pelo próprio Menu Rápido → Controles do RetroArch,
/// salvando no `retroarch.cfg` compartilhado de verdade, sem depender do
/// nosso sistema de remapeamento (que já colidiu com hotkey global uma vez,
/// ver IDEAS.md #009) — uma saída "eu confio mais no RetroArch mesmo" pra
/// quem preferir.
#[tauri::command]
pub async fn open_retroarch() -> Result<LaunchResult, String> {
    let installation = crate::retroarch::ensure_retroarch_installed().await?;
    spawn_emulator(&installation.executable_path, None, &[], |exit_code| {
        println!("[emu-launcher] RetroArch avulso encerrou (exit code {exit_code:?})");
    })
}
