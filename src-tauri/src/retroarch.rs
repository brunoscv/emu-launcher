use futures_util::StreamExt;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

/// Versão fixa pra todo mundo (Bruno + amigos) — netplay do RetroArch exige
/// que host e clientes rodem a mesma versão/cores. Fixada em 1.22.2 porque é
/// a mais recente disponível no buildbot; a 1.18.0 que o Bruno tinha via apt
/// nunca foi publicada lá (o buildbot pula de 1.17.0 pra 1.19.0), então não
/// dava pra replicar exatamente a instalação antiga — combinado com ele
/// migrar pra essa versão gerenciada em todas as máquinas.
const RETROARCH_VERSION: &str = "1.22.2";

struct PlatformInfo {
    os_segment: &'static str,
    arch_segment: &'static str,
    executable_rel: PathBuf,
    cores_rel: PathBuf,
}

/// Estrutura interna dos arquivos do buildbot confirmada baixando e inspecionando
/// de verdade (não é suposição): no Linux vem como AppImage com uma pasta
/// "portable home" ao lado (`<nome>.AppImage.home/`); no Windows é um `.exe`
/// solto com `cores/` no mesmo nível. Extrair `RetroArch.7z` e `RetroArch_cores.7z`
/// no mesmo destino mescla as duas árvores corretamente nos dois casos.
fn platform_info() -> Result<PlatformInfo, String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => {
            let top = "RetroArch-Linux-x86_64";
            Ok(PlatformInfo {
                os_segment: "linux",
                arch_segment: "x86_64",
                executable_rel: Path::new(top).join(format!("{top}.AppImage")),
                cores_rel: Path::new(top)
                    .join(format!("{top}.AppImage.home"))
                    .join(".config/retroarch/cores"),
            })
        }
        ("windows", "x86_64") => {
            let top = "RetroArch-Win64";
            Ok(PlatformInfo {
                os_segment: "windows",
                arch_segment: "x86_64",
                executable_rel: Path::new(top).join("retroarch.exe"),
                cores_rel: Path::new(top).join("cores"),
            })
        }
        (os, arch) => Err(format!(
            "Combinação de SO/arquitetura ainda não suportada pelo instalador: {os} {arch}"
        )),
    }
}

fn install_root() -> Result<PathBuf, String> {
    let mut dir = dirs::data_dir().ok_or("Não foi possível localizar o diretório de dados do usuário")?;
    dir.push("emu-launcher");
    dir.push("retroarch");
    dir.push(RETROARCH_VERSION);
    Ok(dir)
}

#[derive(Debug, Serialize, Clone)]
pub struct RetroArchInstallation {
    pub version: String,
    pub executable_path: String,
    pub cores_dir: String,
}

/// Caminhos esperados pra versão gerenciada, sem baixar nada — usado por
/// `systems.rs` pra montar o `SystemDefinition` de forma determinística.
/// Só depois de `ensure_retroarch_installed` rodar é que o arquivo existe
/// de verdade nesse caminho.
pub fn expected_installation() -> Result<RetroArchInstallation, String> {
    let platform = platform_info()?;
    let root = install_root()?;
    Ok(RetroArchInstallation {
        version: RETROARCH_VERSION.to_string(),
        executable_path: root.join(&platform.executable_rel).to_string_lossy().to_string(),
        cores_dir: root.join(&platform.cores_rel).to_string_lossy().to_string(),
    })
}

/// Baixa e extrai o RetroArch + cores gerenciados pelo app, se ainda não
/// existirem na versão fixa. Idempotente — se o executável já existe, só
/// devolve os caminhos sem baixar nada de novo.
#[tauri::command]
pub async fn ensure_retroarch_installed() -> Result<RetroArchInstallation, String> {
    let platform = platform_info()?;
    let root = install_root()?;
    let executable_path = root.join(&platform.executable_rel);

    if !executable_path.exists() {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let base_url = format!(
            "https://buildbot.libretro.com/stable/{}/{}/{}/",
            RETROARCH_VERSION, platform.os_segment, platform.arch_segment
        );

        download_and_extract(&format!("{base_url}RetroArch.7z"), &root).await?;
        download_and_extract(&format!("{base_url}RetroArch_cores.7z"), &root).await?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&executable_path)
                .map_err(|e| e.to_string())?
                .permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&executable_path, perms).map_err(|e| e.to_string())?;
        }
    }

    if !executable_path.exists() {
        return Err(format!(
            "Instalação concluída mas o executável esperado não apareceu em {}",
            executable_path.display()
        ));
    }

    Ok(RetroArchInstallation {
        version: RETROARCH_VERSION.to_string(),
        executable_path: executable_path.to_string_lossy().to_string(),
        cores_dir: root.join(&platform.cores_rel).to_string_lossy().to_string(),
    })
}

async fn download_and_extract(url: &str, dest: &Path) -> Result<(), String> {
    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {} ao baixar {}", response.status(), url));
    }

    let tmp_path = dest.join("_download.7z");
    {
        let mut file = tokio::fs::File::create(&tmp_path).await.map_err(|e| e.to_string())?;
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        }
    }

    let dest_owned = dest.to_path_buf();
    let tmp_owned = tmp_path.clone();
    tokio::task::spawn_blocking(move || sevenz_rust::decompress_file(&tmp_owned, &dest_owned))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    tokio::fs::remove_file(&tmp_path).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Baixa ~450MB de verdade — não roda em `cargo test` normal, só sob
    /// demanda (`cargo test -- --ignored --nocapture`) pra reverificar o
    /// instalador depois de mexer nele.
    #[tokio::test]
    #[ignore]
    async fn baixa_e_instala_de_verdade() {
        let installation = ensure_retroarch_installed()
            .await
            .expect("instalação deveria funcionar");

        assert!(Path::new(&installation.executable_path).exists());
        assert!(Path::new(&installation.cores_dir).exists());

        let snes_core = Path::new(&installation.cores_dir).join(format!(
            "snes9x_libretro.{}",
            if cfg!(windows) { "dll" } else { "so" }
        ));
        assert!(snes_core.exists(), "core do snes9x deveria existir em {}", snes_core.display());
    }
}
