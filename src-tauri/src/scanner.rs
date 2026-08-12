use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
    pub cover_path: Option<String>,
}

/// Normaliza um nome de rom/capa pra comparação — minúsculo, apóstrofo/aspas
/// virando `_` (convenção observada nas capas do Bruno: "Pugsley's" na rom
/// vira "Pugsley_s" no arquivo de capa, provavelmente de um scraper que
/// sanitiza nome de arquivo).
fn normalize_for_cover_match(name: &str) -> String {
    name.to_lowercase().replace(['\'', '’', '"'], "_")
}

/// Lê `covers_dir` uma vez (não é chamado por rom — seria um `read_dir` por
/// arquivo) e monta um mapa nome-normalizado -> caminho completo, pra cada
/// rom só fazer um lookup em `scan_system_folder`.
fn index_covers(covers_dir: &Path) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Ok(entries) = std::fs::read_dir(covers_dir) else {
        return map;
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let ext_ok = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| matches!(e.to_lowercase().as_str(), "png" | "jpg" | "jpeg"))
            .unwrap_or(false);
        if !ext_ok {
            continue;
        }
        map.insert(normalize_for_cover_match(stem), path.to_string_lossy().to_string());
    }
    map
}

/// Varre `folder` recursivamente e retorna toda rom encontrada, marcada com
/// `system_id` (a pasta já foi escolhida pelo usuário como sendo desse
/// sistema — não tentamos mais adivinhar por conteúdo/extensão, só filtramos
/// arquivos que parecem lixo (readme, imagem, etc) via `system_for_extension`).
pub fn scan_system_folder(system_id: &str, folder: &Path) -> Result<Vec<RomEntry>, String> {
    if !folder.exists() {
        return Err(format!("Pasta não encontrada: {}", folder.display()));
    }

    // Capas ficam numa subpasta "covers" na raiz da pasta do sistema (ex:
    // roms/snes/covers/Nome Da Rom (USA).png) — convenção do Bruno, não um
    // scraper automático ainda (ver IDEAS.md #002/#014). Indexado uma vez
    // só, fora do loop de arquivos.
    let covers = index_covers(&folder.join("covers"));

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

        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("desconhecido")
            .to_string();
        let cover_path = covers.get(&normalize_for_cover_match(&name)).cloned();

        roms.push(RomEntry {
            name,
            path: path.to_string_lossy().to_string(),
            extension,
            system: system_id.to_string(),
            size_bytes: metadata.len(),
            cover_path,
        });
    }

    Ok(roms)
}
