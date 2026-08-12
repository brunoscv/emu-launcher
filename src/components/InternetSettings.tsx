import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  onClose: () => void;
}

/**
 * Tela "🌐 Jogar pela Internet" (IDEAS.md #006/#017) — LAN funciona sozinha,
 * mas pra jogar com amigo em outra casa/rede o roteador do host precisa
 * encaminhar as portas pro RetroArch (netplay, `NETPLAY_PORT` em
 * `lobby.rs`) e pro nosso lobby (`LOBBY_PORT` em `types/lobby.ts`) chegarem
 * até essa máquina. A gente não consegue abrir porta sozinho (isso é
 * configuração do roteador, fora do nosso alcance) — essa tela só deixa bem
 * claro o que precisa ser feito, sem esconder passo nenhum.
 *
 * O endereço público em si (IP ou hostname de DDNS) é digitado pelo próprio
 * usuário, não adivinhado — não tem como descobrir isso sozinho (IP público
 * muda, hostname de DDNS não tem como inferir). Fica salvo só pra reexibir
 * na sala de host (`LobbyScreen.tsx`), lado a lado com o código da sala.
 */
export function InternetSettings({ onClose }: Props) {
  const [localIp, setLocalIp] = useState<string | null>(null);
  const [publicAddress, setPublicAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("get_local_lan_ip")
      .then(setLocalIp)
      .catch((e) => setError(String(e)));
    invoke<string | null>("get_public_host_address").then((addr) => setPublicAddress(addr ?? ""));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await invoke("save_public_host_address", { address: publicAddress });
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="internet-settings">
      <div className="internet-settings__header">
        <h2>🌐 Jogar pela Internet</h2>
        <button className="internet-settings__close" onClick={onClose}>
          Voltar
        </button>
      </div>

      <p className="internet-settings__hint">
        Na mesma rede (Wi-Fi/cabo de casa) o Host/Cliente já funciona direto, sem nada disso.
        Pra jogar com alguém em <strong>outra rede</strong> (outra casa, outra cidade), o
        roteador de quem for hospedar precisa liberar a passagem — sem isso, o convite nunca
        chega no PC do host. Isso é configuração do roteador, a gente não consegue fazer
        sozinho — os passos abaixo são exatamente o que precisa ser feito, nada escondido.
      </p>

      {error && <div className="internet-settings__error">{error}</div>}

      <section className="internet-settings__section">
        <h3>1. Portas que precisam ser liberadas</h3>
        <table className="internet-settings__ports">
          <thead>
            <tr>
              <th>Porta</th>
              <th>Protocolo</th>
              <th>Pra quê</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="internet-settings__mono">7777</td>
              <td>TCP</td>
              <td>Sala de espera (lobby)</td>
            </tr>
            <tr>
              <td className="internet-settings__mono">55435</td>
              <td>TCP</td>
              <td>Netplay (RetroArch)</td>
            </tr>
            <tr>
              <td className="internet-settings__mono">55435</td>
              <td>UDP</td>
              <td>Netplay (RetroArch)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="internet-settings__section">
        <h3>2. Entra no painel do teu roteador</h3>
        <p>
          Geralmente em <code>192.168.0.1</code> ou <code>192.168.1.1</code>, digitado direto
          na barra de endereço do navegador (login/senha costuma estar numa etiqueta atrás do
          roteador, ou é "admin"/"admin"). Procura por uma seção chamada{" "}
          <strong>"Encaminhamento de portas"</strong>, <strong>"Port Forwarding"</strong>,{" "}
          <strong>"Virtual Server"</strong> ou <strong>"NAT"</strong> — o nome muda de marca
          pra marca.
        </p>
      </section>

      <section className="internet-settings__section">
        <h3>3. Cria as 3 regras, todas apontando pro IP local desta máquina</h3>
        <p>
          IP local desta máquina agora:{" "}
          {localIp ? (
            <span className="internet-settings__mono internet-settings__ip">{localIp}</span>
          ) : (
            "detectando..."
          )}
        </p>
        <p className="internet-settings__hint">
          Cada regra tem porta externa = porta interna = a porta da tabela acima, e "IP de
          destino" = o IP mostrado agora mesmo. Se o roteador pedir "faixa de portas", pode
          usar a mesma porta como início e fim (ex: 55435–55435).
        </p>
      </section>

      <section className="internet-settings__section">
        <h3>4. Endereço que seus amigos vão digitar</h3>
        <p className="internet-settings__hint">
          Isso é diferente do IP local acima — é o endereço que alcança essa máquina{" "}
          <strong>de fora</strong> da tua rede: teu IP público (muda de tempos em tempos,
          normalmente) ou um hostname de DDNS (serviços gratuitos tipo DuckDNS ou No-IP dão um
          nome fixo tipo <code>seunome.duckdns.org</code>, que resolve pro teu IP atual mesmo
          quando ele muda — recomendado, senão precisa avisar os amigos toda vez que mudar).
          Você digita aqui, a gente só guarda pra reexibir na tela da sala quando você clicar
          "Host".
        </p>
        <div className="internet-settings__address-row">
          <input
            className="internet-settings__input"
            type="text"
            placeholder="ex: 200.150.10.20 ou seunome.duckdns.org"
            value={publicAddress}
            onChange={(e) => setPublicAddress(e.target.value)}
          />
          <button className="btn-scan" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : saved ? "Salvo ✓" : "Salvar"}
          </button>
        </div>
      </section>

      <section className="internet-settings__section">
        <h3>5. Confirma que abriu de verdade</h3>
        <p className="internet-settings__hint">
          Depois de configurar, teste as portas 7777 e 55435 (TCP) a partir de fora da tua
          rede — tem sites gratuitos de "teste de porta aberta" (ex: canyouseeme.org) que
          fazem isso sem precisar de nada instalado. Se aparecer fechado mesmo com a regra
          certa no roteador, o motivo mais comum é a tua operadora usar <strong>CGNAT</strong>{" "}
          (bem comum em internet residencial/móvel no Brasil) — nesse caso, port-forward não
          funciona de jeito nenhum, não importa o que configure no roteador, porque nem o teu
          IP "público" é realmente seu. A alternativa nesse caso é uma VPN tipo Tailscale
          conectando as máquinas direto (ainda não implementado aqui, ver IDEAS.md #006).
        </p>
      </section>

      <section className="internet-settings__section">
        <h3>E o lado do seu amigo?</h3>
        <p className="internet-settings__hint">
          Só precisa disso tudo quem vai <strong>hospedar</strong> (clicar "Host"). Quem só
          entra como "Cliente" não libera porta nenhuma — só digita o endereço que o host
          passou e o código da sala. Se um dia for a vez do amigo hospedar, aí é ele quem
          segue esses mesmos passos no roteador dele.
        </p>
      </section>

      <style>{`
        .internet-settings {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          overflow-y: auto;
          gap: 0.5rem;
        }

        .internet-settings__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.25rem;
        }

        .internet-settings__header h2 {
          font-family: var(--font-display);
          font-size: 1rem;
          color: var(--ink-primary);
          margin: 0;
        }

        .internet-settings__close {
          background: transparent;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-muted);
          padding: 0.4rem 0.8rem;
          font-size: 0.8rem;
        }

        .internet-settings__hint {
          color: var(--ink-muted);
          font-size: 0.85rem;
          max-width: 720px;
          line-height: 1.5;
          margin: 0 0 0.5rem;
        }

        .internet-settings__error {
          padding: 0.6rem 0.9rem;
          background: color-mix(in srgb, var(--danger) 15%, var(--bg-void));
          color: var(--danger);
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
        }

        .internet-settings__section {
          max-width: 720px;
          padding: 1rem 0;
          border-top: 1px solid var(--border-soft);
        }

        .internet-settings__section h3 {
          font-family: var(--font-display);
          font-size: 0.9rem;
          color: var(--accent-phosphor);
          margin: 0 0 0.6rem;
        }

        .internet-settings__section p {
          font-size: 0.85rem;
          color: var(--ink-primary);
          line-height: 1.5;
          margin: 0 0 0.5rem;
        }

        .internet-settings__section code {
          font-family: var(--font-mono);
          background: var(--bg-panel);
          border-radius: var(--radius-sm);
          padding: 0.1rem 0.35rem;
          font-size: 0.85em;
        }

        .internet-settings__mono {
          font-family: var(--font-mono);
        }

        .internet-settings__ip {
          background: var(--bg-panel);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          padding: 0.15rem 0.5rem;
          color: var(--accent-teal);
        }

        .internet-settings__ports {
          border-collapse: collapse;
          width: 100%;
          font-size: 0.85rem;
        }

        .internet-settings__ports th {
          text-align: left;
          color: var(--ink-muted);
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid var(--border-soft);
        }

        .internet-settings__ports td {
          padding: 0.55rem 0.75rem;
          border-bottom: 1px solid var(--border-soft);
          color: var(--ink-primary);
        }

        .internet-settings__address-row {
          display: flex;
          gap: 0.6rem;
        }

        .internet-settings__input {
          flex: 1;
          background: var(--bg-panel);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          color: var(--ink-primary);
          font-family: var(--font-mono);
          font-size: 0.85rem;
          padding: 0.55rem 0.75rem;
        }
      `}</style>
    </div>
  );
}
