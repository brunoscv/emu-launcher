use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

/// Extensões suportadas -> sistema correspondente.
/// Usado só como filtro de "isso parece uma rom?" — como cada sistema agora
/// tem sua própria pasta configurada (ver library.rs), não precisamos mais
/// adivinhar o sistema pelo conteúdo do arquivo, só reconhecer a extensão.
fn system_for_extension(ext: &str) -> Option<&'static str> {
    match ext.to_lowercase().as_str() {
        "sfc" | "smc" => Some("snes"),
        "nes" => Some("nes"),
        "bin" | "iso" => Some("psx"), // heurística simples; refinar depois com detecção de header
        "z64" => Some("n64"),
        "gba" => Some("gba"),
        "md" => Some("megadrive"),
        "zip" => Some("arcade"), // qualquer coisa; o valor real é ignorado por scan_system_folder
        _ => None,
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RomEntry {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub system: String,
    pub size_bytes: u64,
}

/// Varre `folder` recursivamente e retorna toda rom encontrada, marcada com
/// `system_id` (a pasta já foi escolhida pelo usuário como sendo desse
/// sistema — não tentamos mais adivinhar por conteúdo/extensão, só filtramos
/// arquivos que parecem lixo (readme, imagem, etc) via `system_for_extension`).
pub fn scan_system_folder(system_id: &str, folder: &Path) -> Result<Vec<RomEntry>, String> {
    if !folder.exists() {
        return Err(format!("Pasta não encontrada: {}", folder.display()));
    }

    let mut roms = Vec::new();

    for entry in WalkDir::new(folder)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        let extension = match path.extension().and_then(|e| e.to_str()) {
            Some(ext) => ext.to_string(),
            None => continue,
        };

        if system_for_extension(&extension).is_none() {
            continue;
        }

        let metadata = entry.metadata().map_err(|e| e.to_string())?;

        roms.push(RomEntry {
            name: path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("desconhecido")
                .to_string(),
            path: path.to_string_lossy().to_string(),
            extension,
            system: system_id.to_string(),
            size_bytes: metadata.len(),
        });
    }

    Ok(roms)
}
