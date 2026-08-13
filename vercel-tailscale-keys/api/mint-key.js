// Endpoint único: POST /api/mint-key
//
// Gera uma auth key efêmera e pré-autorizada do Tailscale, marcada
// "tag:guest" (ver política em login.tailscale.com/admin/acls) — quem
// entrar com essa chave só alcança máquinas "tag:host" nas portas do jogo,
// nunca o resto da tailnet do Bruno. É isso que deixa o app do amigo
// entrar na tailnet sem NUNCA precisar logar em nada (nem Tailscale, nem
// Google) — a chave em si já é a autorização (IDEAS.md #021).
//
// As credenciais reais (client_id/client_secret do OAuth client do
// Tailscale) nunca ficam no código nem no app distribuído — só existem
// aqui, como variável de ambiente da Vercel, exatamente pra isso: se o
// binário do app fosse descompilado, ninguém acha a credencial capaz de
// gerar chave nenhuma, só o token compartilhado (`MINT_KEY_SHARED_SECRET`)
// que, na pior hipótese de vazar, só permite gerar mais chaves de convidado
// — não dá acesso administrativo à tailnet.

const TAILSCALE_API = "https://api.tailscale.com/api/v2";

// Expira rápido de propósito — a chave só precisa viver o tempo entre "o
// app do amigo pediu" e "o tailscale up dele terminou de rodar", segundos
// depois. Reduz o estrago de uma chave que vazar de algum jeito.
const KEY_EXPIRY_SECONDS = 300;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "método não permitido, use POST" });
    return;
  }

  const sharedSecret = req.headers["x-emu-launcher-secret"];
  if (!sharedSecret || sharedSecret !== process.env.MINT_KEY_SHARED_SECRET) {
    res.status(401).json({ error: "não autorizado" });
    return;
  }

  const { TS_OAUTH_CLIENT_ID, TS_OAUTH_CLIENT_SECRET } = process.env;
  if (!TS_OAUTH_CLIENT_ID || !TS_OAUTH_CLIENT_SECRET) {
    res.status(500).json({ error: "servidor mal configurado: faltam credenciais do Tailscale" });
    return;
  }

  try {
    const tokenResponse = await fetch(`${TAILSCALE_API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: TS_OAUTH_CLIENT_ID,
        client_secret: TS_OAUTH_CLIENT_SECRET,
      }),
    });
    if (!tokenResponse.ok) {
      const detail = await tokenResponse.text();
      res.status(502).json({ error: `falha ao autenticar no Tailscale: ${detail}` });
      return;
    }
    const { access_token: accessToken } = await tokenResponse.json();

    const keyResponse = await fetch(`${TAILSCALE_API}/tailnet/-/keys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        capabilities: {
          devices: {
            create: {
              reusable: false,
              ephemeral: true,
              preauthorized: true,
              tags: ["tag:guest"],
            },
          },
        },
        expirySeconds: KEY_EXPIRY_SECONDS,
        description: "emu-launcher - convidado (gerada sob demanda)",
      }),
    });
    if (!keyResponse.ok) {
      const detail = await keyResponse.text();
      res.status(502).json({ error: `falha ao gerar a chave: ${detail}` });
      return;
    }
    const { key } = await keyResponse.json();

    res.status(200).json({ key });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
