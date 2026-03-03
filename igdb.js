const axios = require("axios");

// Token em memória — renovado automaticamente quando expira
let tokenCache = { access_token: null, expires_at: 0 };

/**
 * Busca (ou reutiliza) o access token OAuth da Twitch para a IGDB.
 * O token dura ~60 dias; renovamos automaticamente quando expira.
 */
async function getAccessToken() {
  const now = Date.now();

  // Ainda válido? Retorna o cacheado
  if (tokenCache.access_token && now < tokenCache.expires_at - 60_000) {
    return tokenCache.access_token;
  }

  console.log("[Auth] Renovando token IGDB...");

  const { data } = await axios.post("https://id.twitch.tv/oauth2/token", null, {
    params: {
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    },
  });

  tokenCache = {
    access_token: data.access_token,
    expires_at: now + data.expires_in * 1000,
  };

  console.log("[Auth] Token obtido com sucesso ✓");
  return tokenCache.access_token;
}

/**
 * Faz uma query na IGDB API Fields Language (Apicalypse).
 * @param {string} endpoint  - ex: "games", "genres", "screenshots"
 * @param {string} body      - query Apicalypse ex: 'fields id,name; limit 20;'
 */
async function igdbQuery(endpoint, body) {
  const token = await getAccessToken();

  const { data } = await axios.post(
    `https://api.igdb.com/v4/${endpoint}`,
    body,
    {
      headers: {
        "Client-ID": process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
    }
  );

  return data;
}

module.exports = { igdbQuery };
