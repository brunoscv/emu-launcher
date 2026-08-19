use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;

/// Versão fixa, mesmo espírito da versão fixa do RetroArch (`retroarch.rs`)
/// — todo mundo instala a mesma versão, sem surpresa de "latest" mudando
/// entre uma instalação e outra. Confirmado via pkgs.tailscale.com/stable/
/// em 13/08/2026 (IDEAS.md #021).
const TAILSCALE_VERSION: &str = "1.102.2";

/// Microserviço próprio (`vercel-tailscale-keys/`, IDEAS.md #021) que gera
/// auth key efêmera sob demanda — é o que deixa o app do amigo entrar na
/// tailnet sem logar em nada. O segredo compartilhado embutido aqui não é
/// segredo "de verdade" (qualquer um que descompilar o app acha ele) — mas
/// o pior cenário de vazamento é só permitir gerar mais chaves de
/// convidado (`tag:guest`, restrita pelo ACL a alcançar só `tag:host` nas
/// portas do jogo), nunca acesso administrativo à tailnet. Trade-off
/// aceito de propósito, documentado no `mint-key.js`.
const MINT_KEY_URL: &str = "https://emu-launcher-vq6y.vercel.app/api/mint-key";
const MINT_KEY_SHARED_SECRET: &str = "584d0fc52b61e63e75ac57e8dd47f0dd190fa29833ea582b5b689de148ccb5f3";

/// `tailscale.exe` é um executável de console — sem isso, toda vez que
/// nosso app (subsistema "windows", sem console próprio) o spawna, o
/// Windows abre uma janela de console nova pra ele, que fica "piscando" na
/// barra de tarefas sem ganhar foco (o processo que disparou está em
/// segundo plano, então a nova janela esbarra na trava de foreground-stealing
/// do Windows). Foi exatamente o "algo pisca na barra de tarefas" que o
/// Bruno viu testando o login numa máquina Windows de verdade (19/08/2026)
/// — não era o navegador (esse abre à parte, via `open::that`), era essa
/// janela de console vazia do `tailscale up`/`tailscale ip` em si. Suprimir
/// não afeta o processo nem sua saída — stdout/stderr continuam sendo
/// capturados normalmente via pipe.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
pub(crate) fn suppress_console_window(cmd: &mut std::process::Command) -> &mut std::process::Command {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW)
}
#[cfg(not(windows))]
pub(crate) fn suppress_console_window(cmd: &mut std::process::Command) -> &mut std::process::Command {
    cmd
}

#[cfg(windows)]
fn suppress_console_window_tokio(cmd: &mut tokio::process::Command) -> &mut tokio::process::Command {
    // `tokio::process::Command::creation_flags` é método próprio dele (não
    // vem do trait `std::os::windows::process::CommandExt`), então não
    // precisa importar nada extra aqui.
    cmd.creation_flags(CREATE_NO_WINDOW)
}
#[cfg(not(windows))]
fn suppress_console_window_tokio(cmd: &mut tokio::process::Command) -> &mut tokio::process::Command {
    cmd
}

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

/// Caminho do executável pra rodar comandos (`tailscale up`, `tailscale ip`,
/// etc) — mesmo motivo do `known_install_path`: se o Tailscale acabou de ser
/// instalado nesta mesma sessão do app (`ensure_tailscale_installed`), o
/// PATH do processo atual não reflete a mudança que o instalador fez (só
/// processos novos veem). Sem isso, `Command::new("tailscale")` falha com
/// "program not found" mesmo com o Tailscale instalado e funcionando — foi
/// exatamente esse bug que o Bruno bateu testando com um amigo no Windows
/// (19/08/2026). Cai pro nome nu como último recurso, pra continuar
/// funcionando em instalações mais antigas onde o PATH já estava correto
/// antes do app abrir.
pub(crate) fn resolve_tailscale_exe() -> PathBuf {
    known_install_path()
        .filter(|p| p.exists())
        .unwrap_or_else(|| PathBuf::from("tailscale"))
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
    let mut cmd = std::process::Command::new("tailscale");
    cmd.arg("--version");
    suppress_console_window(&mut cmd)
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

/// Dispara o login do Tailscale (`tailscale up`, sem authkey — fluxo
/// interativo de verdade, mesmo enquanto o microserviço de auth key da
/// Vercel não existe, ver IDEAS.md #021). Instalar (`ensure_tailscale_installed`)
/// não loga sozinho — essa etapa é separada de propósito, porque descobrimos
/// na prática (13/08/2026, teste do Bruno) que a tela ficava presa num
/// estado confuso "instalado, mas nem detectado nem com erro" quando as
/// duas coisas ficavam misturadas numa checagem só.
///
/// Não espera o `tailscale up` terminar (ele fica bloqueado até alguém
/// autenticar no navegador, ou pra sempre se ninguém autenticar) — só lê a
/// saída dele numa tarefa em segundo plano até achar a URL de login, abre
/// no navegador padrão via `open::that`, e também emite um evento
/// `tailscale-login-url` pro front-end mostrar a URL como link clicável de
/// reforço (caso abrir o navegador sozinho falhe por algum motivo).
#[tauri::command]
pub async fn start_tailscale_login(app: tauri::AppHandle) -> Result<(), String> {
    use std::process::Stdio;
    use tokio::io::BufReader;

    require_windows()?;

    let mut cmd = tokio::process::Command::new(resolve_tailscale_exe());
    cmd.arg("up").stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = suppress_console_window_tokio(&mut cmd)
        .spawn()
        .map_err(|e| format!("não consegui iniciar 'tailscale up': {e}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_clone = app.clone();

    tokio::spawn(async move {
        // A URL de login pode sair no stdout ou no stderr dependendo da
        // versão — lê os dois em paralelo, o primeiro que achar vence.
        let mut lines = Vec::new();
        if let Some(out) = stdout {
            lines.push(tokio::spawn(watch_for_login_url(BufReader::new(out), app_clone.clone())));
        }
        if let Some(err) = stderr {
            lines.push(tokio::spawn(watch_for_login_url(BufReader::new(err), app_clone)));
        }
        for l in lines {
            let _ = l.await;
        }
        // Não mata o processo — `tailscale up` some sozinho quando o login
        // termina (ou fica esperando, sem problema, é só um processo leve).
        let _ = child.wait().await;
    });

    Ok(())
}

async fn watch_for_login_url<R: tokio::io::AsyncRead + Unpin>(
    reader: tokio::io::BufReader<R>,
    app: tauri::AppHandle,
) {
    use tokio::io::AsyncBufReadExt;
    let mut lines = reader.lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if let Some(idx) = line.find("https://login.tailscale.com") {
            let url = line[idx..].trim().to_string();
            let _ = open::that(&url);
            let _ = app.emit("tailscale-login-url", url);
            return;
        }
    }
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

#[derive(Debug, Deserialize)]
struct MintKeyResponse {
    key: Option<String>,
    error: Option<String>,
}

/// Fluxo do "Cliente" (o amigo, IDEAS.md #021) — instala o Tailscale se
/// ainda não tiver (mesmo instalador silencioso do `ensure_tailscale_installed`,
/// UAC só nesse passo) e pede uma auth key descartável pro microserviço da
/// Vercel pra entrar na tailnet direto, sem NENHUM login/navegador
/// aparecer (diferente de `start_tailscale_login`, que é o fluxo do host,
/// com conta própria). Uma ação só, do jeito que o amigo só clica
/// "Cliente" e nem sabe que Tailscale existe.
///
/// `tailscale up --authkey=...` no Windows não pede elevação (diferente da
/// instalação do driver) — só fala com o serviço já rodando, por isso não
/// passa por `runas` aqui.
#[tauri::command]
pub async fn join_tailnet_as_guest(app: tauri::AppHandle) -> Result<(), String> {
    require_windows()?;

    if !is_tailscale_installed() {
        ensure_tailscale_installed(app.clone()).await?;
    }

    let client = reqwest::Client::new();
    let response = client
        .post(MINT_KEY_URL)
        .header("x-emu-launcher-secret", MINT_KEY_SHARED_SECRET)
        .send()
        .await
        .map_err(|e| format!("não consegui falar com o serviço de convite: {e}"))?;

    let body: MintKeyResponse = response.json().await.map_err(|e| e.to_string())?;
    let key = body
        .key
        .ok_or_else(|| body.error.unwrap_or_else(|| "serviço de convite não devolveu uma chave".to_string()))?;

    let mut cmd = tokio::process::Command::new(resolve_tailscale_exe());
    cmd.arg("up").arg(format!("--authkey={key}"));
    let status = suppress_console_window_tokio(&mut cmd)
        .status()
        .await
        .map_err(|e| format!("não consegui rodar 'tailscale up': {e}"))?;

    if !status.success() {
        return Err(format!("'tailscale up' terminou com código {:?}", status.code()));
    }
    Ok(())
}
