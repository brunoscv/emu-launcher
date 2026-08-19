use crate::db;
use std::net::UdpSocket;
use std::process::Command;

const DEDICATED_SERVER_HOST_KEY: &str = "dedicated_server_host";
const PUBLIC_HOST_ADDRESS_KEY: &str = "public_host_address";

/// Endereço do "meu servidor" (IDEAS.md #008) — quando configurado, é o
/// primeiro alvo que "Host" tenta antes de cair pro modo embutido local.
/// `None` = nunca configurado, cai direto pro modo embutido sem tentar rede.
#[tauri::command]
pub fn get_dedicated_server_host() -> Result<Option<String>, String> {
    let conn = db::connect()?;
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [DEDICATED_SERVER_HOST_KEY],
        |row| row.get::<_, String>(0),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.to_string()),
    })
}

#[tauri::command]
pub fn save_dedicated_server_host(host: String) -> Result<(), String> {
    let conn = db::connect()?;
    let trimmed = host.trim();
    if trimmed.is_empty() {
        conn.execute(
            "DELETE FROM app_settings WHERE key = ?1",
            [DEDICATED_SERVER_HOST_KEY],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [DEDICATED_SERVER_HOST_KEY, trimmed],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Endereço (IP público ou hostname de DDNS) que o Bruno digitou como "o que
/// os amigos usam pra conectar em mim" (IDEAS.md #006/#017) — puramente
/// informativo, só pra reexibir na sala de host. A gente não descobre isso
/// sozinho (IP público muda, e não tem como adivinhar um hostname de DDNS):
/// quem escolhe é o próprio usuário, lendo as instruções da tela "Jogar pela
/// Internet".
#[tauri::command]
pub fn get_public_host_address() -> Result<Option<String>, String> {
    let conn = db::connect()?;
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [PUBLIC_HOST_ADDRESS_KEY],
        |row| row.get::<_, String>(0),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.to_string()),
    })
}

#[tauri::command]
pub fn save_public_host_address(address: String) -> Result<(), String> {
    let conn = db::connect()?;
    let trimmed = address.trim();
    if trimmed.is_empty() {
        conn.execute("DELETE FROM app_settings WHERE key = ?1", [PUBLIC_HOST_ADDRESS_KEY])
            .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [PUBLIC_HOST_ADDRESS_KEY, trimmed],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// IP local (LAN) desta máquina — pra tela "Jogar pela Internet" mostrar pra
/// onde apontar a regra de encaminhamento de porta no roteador. Truque
/// padrão sem precisar de rede de verdade: um socket UDP "conectado" nunca
/// manda pacote nenhum (UDP não tem handshake), só faz o kernel escolher
/// qual interface local seria usada pra alcançar esse destino — 8.8.8.8 é
/// só uma âncora pública estável, não tem tráfego real acontecendo.
#[tauri::command]
pub fn get_local_lan_ip() -> Result<String, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
    socket
        .local_addr()
        .map(|addr| addr.ip().to_string())
        .map_err(|e| e.to_string())
}

/// IP do Tailscale desta máquina (faixa `100.x.x.x`), pra tela "Jogar pela
/// Internet" oferecer como alternativa quando port-forward não é viável
/// (CGNAT de operadora, ver IDEAS.md #006/#018 — confirmado na prática pro
/// Bruno com a operadora Nio). `None` cobre tanto "não instalado" quanto
/// "instalado mas não logado/conectado" — não faz sentido diferenciar os dois
/// casos aqui, os dois levam ao mesmo texto de instrução na UI. Não tenta
/// instalar nem configurar nada sozinho: `tailscale up` pede autenticação
/// interativa (abre navegador), fora do alcance de um command Tauri.
#[tauri::command]
pub fn get_tailscale_ip() -> Result<Option<String>, String> {
    let mut cmd = Command::new(crate::tailscale_install::resolve_tailscale_exe());
    cmd.arg("ip").arg("-4");
    let output = match crate::tailscale_install::suppress_console_window(&mut cmd).output() {
        Ok(o) => o,
        Err(_) => return Ok(None),
    };
    if !output.status.success() {
        return Ok(None);
    }
    let ip = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if ip.is_empty() {
        Ok(None)
    } else {
        Ok(Some(ip))
    }
}
