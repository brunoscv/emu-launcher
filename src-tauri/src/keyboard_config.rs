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
///
/// `device_number` (só em partidas multiplayer, `None` no "Jogar" solo):
/// escreve `netplay_request_device_p{N} = "true"`, reivindicando
/// explicitamente esse slot de controle. Sem isso, o auto-assign padrão
/// do netplay dá o device 1 pro HOST (sempre headless, sem ninguém nele)
/// e só o primeiro cliente vira device 2 — a config de teclado local
/// (sempre escrita como "player 1") ficava correta mas controlando uma
/// porta que ninguém usava de verdade (bug real descoberto 11/08/2026,
/// ver `protocol.rs::ServerMessage::MatchStarting`).
#[tauri::command]
pub fn write_keyboard_config(
    players: Vec<PlayerKeyboardConfig>,
    device_number: Option<u8>,
) -> Result<String, String> {
    let path = config_path()?;
    let mut contents = String::from("config_save_on_exit = \"false\"\n");

    if let Some(n) = device_number {
        contents.push_str(&format!("netplay_request_device_p{n} = \"true\"\n"));
        // Overlay de ping em tempo real (canto da tela) — só faz sentido em
        // partida de verdade, por isso dentro do `if` de multiplayer, não no
        // "Jogar" solo. Pedido depois de sentir engasgos numa partida real de
        // 3 PCs (19/08/2026, International Superstar Soccer Deluxe) sem
        // nenhum jeito de saber, jogando, se um pico de ping bateu junto com
        // o travamento.
        contents.push_str("netplay_ping_show = \"true\"\n");
    }

    for player in &players {
        for (suffix, key) in &player.mapping {
            contents.push_str(&format!(
                "input_player{}_{} = \"{}\"\n",
                player.player, suffix, key
            ));
        }
    }

    println!("[keyboard_config] escrevendo {} com:\n{contents}", path.display());
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
