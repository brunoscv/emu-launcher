import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface Props {
  onClose: () => void;
}

interface TailscaleInstallProgress {
  phase: string;
  downloaded_bytes: number;
  total_bytes: number | null;
}

const TAILSCALE_PHASE_LABEL: Record<string, string> = {
  baixando: "Baixando o instalador do Tailscale...",
  instalando: "Instalando (deve pedir permissão de administrador)...",
};

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
  const [tailscaleIp, setTailscaleIp] = useState<string | null>(null);
  const [tailscaleChecked, setTailscaleChecked] = useState(false);
  const [tailscaleInstalled, setTailscaleInstalled] = useState<boolean | null>(null);
  const [tailscaleInstallProgress, setTailscaleInstallProgress] = useState<TailscaleInstallProgress | null>(
    null
  );
  const [tailscaleInstallError, setTailscaleInstallError] = useState<string | null>(null);
  const [tailscaleLoggingIn, setTailscaleLoggingIn] = useState(false);
  const [tailscaleLoginUrl, setTailscaleLoginUrl] = useState<string | null>(null);
  const [tailscaleLoginError, setTailscaleLoginError] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("get_local_lan_ip")
      .then(setLocalIp)
      .catch((e) => setError(String(e)));
    invoke<string | null>("get_public_host_address").then((addr) => setPublicAddress(addr ?? ""));
    invoke<string | null>("get_tailscale_ip")
      .then(setTailscaleIp)
      .finally(() => setTailscaleChecked(true));
    invoke<boolean>("is_tailscale_installed").then(setTailscaleInstalled);
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<TailscaleInstallProgress>("tailscale-install-progress", (event) => {
      setTailscaleInstallProgress(event.payload);
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<string>("tailscale-login-url", (event) => {
      setTailscaleLoginUrl(event.payload);
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  // Depois de "tailscale up" ser disparado, o login acontece no navegador
  // (fora do nosso controle) — em vez de pedir pra apertar "atualizar" na
  // mão, confere sozinho de tempos em tempos se já logou, por até 2 minutos.
  async function pollForLogin() {
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const ip = await invoke<string | null>("get_tailscale_ip");
      if (ip) {
        setTailscaleIp(ip);
        setTailscaleLoggingIn(false);
        setTailscaleLoginUrl(null);
        return;
      }
    }
    setTailscaleLoggingIn(false);
  }

  async function handleTailscaleLogin() {
    setTailscaleLoginError(null);
    setTailscaleLoginUrl(null);
    setTailscaleLoggingIn(true);
    try {
      await invoke("start_tailscale_login");
      pollForLogin();
    } catch (e) {
      setTailscaleLoginError(String(e));
      setTailscaleLoggingIn(false);
    }
  }

  // Só Windows por enquanto (IDEAS.md #021) — o backend recusa em qualquer
  // outro SO com uma mensagem clara, então não precisa esconder o botão
  // artificialmente aqui, só deixar o erro falar por si se clicar em Linux/Mac.
  async function handleInstallTailscale() {
    setTailscaleInstallError(null);
    setTailscaleInstallProgress({ phase: "baixando", downloaded_bytes: 0, total_bytes: null });
    try {
      await invoke("ensure_tailscale_installed");
      setTailscaleInstalled(true);
      const ip = await invoke<string | null>("get_tailscale_ip");
      setTailscaleIp(ip);
    } catch (e) {
      setTailscaleInstallError(String(e));
    } finally {
      setTailscaleInstallProgress(null);
    }
  }

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
        <h3>6. Deu CGNAT? Usa o Tailscale</h3>
        <p className="internet-settings__hint">
          Se o teste do passo 5 deu porta fechada e o IP da WAN no painel do roteador é
          diferente do IP público que você vê em sites tipo "qual meu IP" (ou está na faixa{" "}
          <code>100.64.x.x</code>–<code>100.127.x.x</code>), é CGNAT — a operadora compartilha
          teu IP público com outras casas, então nenhuma regra de port-forward resolve. O
          <strong> Tailscale</strong> contorna isso criando uma rede virtual direto entre as
          máquinas, sem depender de porta aberta no roteador.
        </p>

        {!tailscaleChecked ? (
          <p className="internet-settings__hint">Verificando o Tailscale...</p>
        ) : (
          <>
            <p className="internet-settings__status-row">
              {tailscaleInstalled ? (
                <span className="internet-settings__badge internet-settings__badge--ok">✅ Instalado</span>
              ) : (
                <span className="internet-settings__badge internet-settings__badge--missing">
                  ⬇ Não instalado
                </span>
              )}
              {tailscaleIp ? (
                <span className="internet-settings__badge internet-settings__badge--ok">✅ Conectado</span>
              ) : (
                <span className="internet-settings__badge internet-settings__badge--missing">
                  ⏳ Não conectado
                </span>
              )}
            </p>

            {tailscaleIp && (
              <>
                <p>
                  IP desta máquina na tailnet:{" "}
                  <span className="internet-settings__mono internet-settings__ip">{tailscaleIp}</span>
                </p>
                <button
                  className="btn-scan"
                  onClick={() => setPublicAddress(tailscaleIp)}
                  disabled={publicAddress === tailscaleIp}
                >
                  Usar esse IP no campo do passo 4
                </button>
              </>
            )}

            {!tailscaleInstalled && (
              <>
                {tailscaleInstallError && (
                  <div className="internet-settings__error">{tailscaleInstallError}</div>
                )}

                {tailscaleInstallProgress ? (
                  <p className="internet-settings__hint">
                    {TAILSCALE_PHASE_LABEL[tailscaleInstallProgress.phase] ?? "Instalando..."}
                    {tailscaleInstallProgress.total_bytes
                      ? ` (${Math.round(
                          (tailscaleInstallProgress.downloaded_bytes /
                            tailscaleInstallProgress.total_bytes) *
                            100
                        )}%)`
                      : ""}
                  </p>
                ) : (
                  <button className="btn-scan" onClick={handleInstallTailscale}>
                    Instalar Tailscale automaticamente
                  </button>
                )}

                <p className="internet-settings__hint">
                  Instalação automática funciona no Windows (vai pedir permissão de administrador
                  uma vez, igual instalar qualquer programa). No Linux, ainda precisa rodar você
                  mesmo:
                </p>
                <pre className="internet-settings__code">
                  curl -fsSL https://tailscale.com/install.sh | sh{"\n"}sudo tailscale up
                </pre>
              </>
            )}

            {tailscaleInstalled && !tailscaleIp && (
              <>
                <p className="internet-settings__hint">
                  Instalado, mas falta logar — sem isso o Tailscale não conecta em lugar nenhum.
                </p>

                {tailscaleLoginError && (
                  <div className="internet-settings__error">{tailscaleLoginError}</div>
                )}

                {tailscaleLoggingIn ? (
                  <p className="internet-settings__hint">
                    Aguardando login no navegador...
                    {tailscaleLoginUrl && (
                      <>
                        {" "}
                        Se não abriu sozinho,{" "}
                        <a href={tailscaleLoginUrl} target="_blank" rel="noreferrer">
                          clica aqui
                        </a>
                        .
                      </>
                    )}
                  </p>
                ) : (
                  <button className="btn-scan" onClick={handleTailscaleLogin}>
                    Fazer login
                  </button>
                )}
              </>
            )}
          </>
        )}

        <p className="internet-settings__hint">
          O amigo também precisa instalar o Tailscale e entrar na <strong>mesma tailnet</strong>{" "}
          — no painel <code>login.tailscale.com/admin/users</code> tem a opção de convidar por
          e-mail. Sem isso, as duas máquinas ficam em redes virtuais separadas e não se
          enxergam. Depois dos dois conectados, é só usar o IP <code>100.x.x.x</code> do host
          no lugar do IP público, no campo do passo 4.
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

        .internet-settings__status-row {
          display: flex;
          gap: 0.5rem;
          margin: 0 0 0.75rem;
        }

        .internet-settings__badge {
          font-size: 0.8rem;
          font-weight: 600;
          padding: 0.15rem 0.55rem;
          border-radius: var(--radius-sm);
          background: var(--bg-panel);
        }

        .internet-settings__badge--ok {
          color: var(--accent-teal);
        }

        .internet-settings__badge--missing {
          color: var(--ink-muted);
        }

        .internet-settings__code {
          background: var(--bg-panel);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          padding: 0.6rem 0.8rem;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--accent-teal);
          overflow-x: auto;
          margin: 0 0 0.5rem;
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
