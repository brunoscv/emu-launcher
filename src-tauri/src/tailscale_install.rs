use serde::Serialize;
use std::path::PathBuf;
use tauri::Emitter;

/// Versão fixa, mesmo espírito da versão fixa do RetroArch (`retroarch.rs`)
/// — todo mundo instala a mesma versão, sem surpresa de "latest" mudando
/// entre uma instalação e outra. Confirmado via pkgs.tailscale.com/stable/
/// em 13/08/2026 (IDEAS.md #021).
const TAILSCALE_VERSION: &str = "1.102.2";

/// Só Windows por enquanto (IDEAS.md #021 — decisão do Bruno de focar no
/// Windows primeiro, já que é o que os amigos usam; Linux fica pra depois,
/// com a Rota A embutida que já validamos separadamente). Chamar isso em
/// outro SO devolve erro explícito em vez de fingir que funciona.
fn require_windows() -> Result<(), String> {
    if cfg!(windows) {
        Ok(())
    } else {
        Err("Instalação automática do Tailscale só está implementada pro Windows por enquanto".to_string())
    }
}

/// Caminho onde o instalador oficial do Tailscale coloca o executável —
/// checagem mais confiável que depender do PATH, porque o PATH de um
/// processo já em execução (nosso próprio app) não é atualizado
/// automaticamente depois que um instalador roda e mexe nas variáveis de
/// ambiente do sistema (só processos novos veem a mudança).
fn known_install_path() -> Option<PathBuf> {
    let program_files = std::env::var("ProgramFiles").ok()?;
    Some(PathBuf::from(program_files).join("Tailscale").join("tailscale.exe"))
}

/// Confere se o Tailscale (o app oficial deles, Rota B) já está instalado
/// nessa máquina — sem instalar nada. Tenta o caminho conhecido primeiro
/// (mais confiável, ver `known_install_path`) e cai pro PATH como reforço.
#[tauri::command]
pub fn is_tailscale_installed() -> bool {
    if let Some(path) = known_install_path() {
        if path.exists() {
            return true;
        }
    }
    std::process::Command::new("tailscale")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[derive(Debug, Serialize, Clone)]
struct InstallProgress {
    phase: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
}

/// Baixa o instalador oficial do Tailscale (MSI, direto de
/// pkgs.tailscale.com — não é build nossa, é o binário deles) e roda em
/// modo silencioso, pedindo elevação (UAC) só pra esse passo — não eleva o
/// app inteiro. `TS_NOLAUNCH=1` evita que o ícone/GUI deles apareça na
/// bandeja logo depois de instalar; controlamos tudo via `tailscale.exe`
/// na linha de comando a partir daqui (mesmo padrão de `get_tailscale_ip`
/// em `settings.rs`), sem depender da interface gráfica oficial.
///
/// Idempotente — se já estiver instalado, não baixa nada de novo.
///
/// NOTA DE RISCO: só testado em CI (compila pro Windows), ainda sem teste
/// numa máquina Windows real — mesma ressalva que `ensure_retroarch_installed`
/// já tinha (IDEAS.md #003) antes de ser validado ao vivo.
#[tauri::command]
pub async fn ensure_tailscale_installed(app: tauri::AppHandle) -> Result<(), String> {
    require_windows()?;

    if is_tailscale_installed() {
        return Ok(());
    }

    let url = format!("https://pkgs.tailscale.com/stable/tailscale-setup-{TAILSCALE_VERSION}-amd64.msi");
    let tmp_path = std::env::temp_dir().join(format!("tailscale-setup-{TAILSCALE_VERSION}-amd64.msi"));

    download_installer(&url, &tmp_path, &app).await?;

    let _ = app.emit("tailscale-install-progress", InstallProgress {
        phase: "instalando".to_string(),
        downloaded_bytes: 0,
        total_bytes: None,
    });

    run_installer_elevated(&tmp_path)?;

    let _ = tokio::fs::remove_file(&tmp_path).await;

    // O msiexec elevado roda em processo separado; espera um pouco e confere
    // (com algumas tentativas — a escrita em disco/registro do instalador
    // não é instantânea) antes de reportar sucesso de verdade.
    for _ in 0..10 {
        if is_tailscale_installed() {
            let _ = app.emit("tailscale-install-progress", InstallProgress {
                phase: "concluído".to_string(),
                downloaded_bytes: 0,
                total_bytes: None,
            });
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    Err("Instalador rodou mas o Tailscale não apareceu no caminho esperado — talvez o UAC tenha sido cancelado".to_string())
}

async fn download_installer(url: &str, dest: &PathBuf, app: &tauri::AppHandle) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {} ao baixar {}", response.status(), url));
    }
    let total_bytes = response.content_length();

    let mut file = tokio::fs::File::create(dest).await.map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    let mut downloaded_bytes: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        downloaded_bytes += chunk.len() as u64;
        let _ = app.emit("tailscale-install-progress", InstallProgress {
            phase: "baixando".to_string(),
            downloaded_bytes,
            total_bytes,
        });
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// `runas::Command` dispara a mesma janela de UAC que aparece ao clicar
/// "Executar como administrador" — só nesse processo filho (`msiexec`), o
/// nosso app continua rodando sem privilégio nenhum antes e depois disso.
fn run_installer_elevated(msi_path: &PathBuf) -> Result<(), String> {
    let status = runas::Command::new("msiexec")
        .arg("/i")
        .arg(msi_path)
        .arg("/quiet")
        .arg("/norestart")
        .arg("TS_NOLAUNCH=1")
        .status()
        .map_err(|e| format!("não consegui iniciar o instalador elevado: {e}"))?;

    if !status.success() {
        return Err(format!("instalador terminou com código {:?} (talvez UAC cancelado)", status.code()));
    }
    Ok(())
}
