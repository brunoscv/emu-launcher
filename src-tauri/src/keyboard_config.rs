use serde::Deserialize;
use std::collections::HashMap;

/// Mapeamento de UM jogador já traduzido pro sufixo de config do RetroArch
/// (`up`/`down`/`a`/`b`/... — ver `BUTTON_TO_SUFFIX` no frontend,
/// `src/keyboard/types.ts`) — a tradução de `RetroPadButton` fica só no
/// TypeScript, esse comando só escreve o arquivo.
#[derive(Debug, Deserialize)]
pub struct PlayerKeyboardConfig {
    pub player: u8,
    pub mapping: HashMap<String, String>,
}

fn config_path() -> Result<std::path::PathBuf, String> {
    let mut dir = dirs::data_dir().ok_or("Não foi possível localizar o diretório de dados do usuário")?;
    dir.push("emu-launcher");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push("keyboard_session.cfg");
    Ok(dir)
}

/// Escreve um `--appendconfig` com `input_player{N}_{botão} = "{tecla}"`
/// pra cada jogador configurado (IDEAS.md #009) — mesmo mecanismo que
/// `lobby.rs::write_headless_config` já usa pro host headless. Chamado na
/// hora de lançar (tanto "Jogar" quanto Host/Cliente), não fica escrito
/// permanentemente — sobrescreve a cada partida com o mapeamento atual.
///
/// `config_save_on_exit = "false"` é essencial (bug real encontrado
/// 11/08/2026, mesma causa do bug do host headless corrigido de manhã em
/// `lobby.rs::write_headless_config`): sem isso, o RetroArch salva o
/// config efetivo de volta no `retroarch.cfg` COMPARTILHADO ao fechar,
/// baking permanentemente o mapeamento temporário de um jogador por cima
/// do padrão de fábrica de todo mundo.
#[tauri::command]
pub fn write_keyboard_config(players: Vec<PlayerKeyboardConfig>) -> Result<String, String> {
    let path = config_path()?;
    let mut contents = String::from("config_save_on_exit = \"false\"\n");

    for player in &players {
        for (suffix, key) in &player.mapping {
            contents.push_str(&format!(
                "input_player{}_{} = \"{}\"\n",
                player.player, suffix, key
            ));
        }
    }

    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
