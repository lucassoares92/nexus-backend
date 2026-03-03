const express = require("express");
const NodeCache = require("node-cache");
const { igdbQuery } = require("../igdb");

const router = express.Router();

// Cache local de 5 minutos para evitar requests repetidos
const cache = new NodeCache({ stdTTL: 300 });

// ── Helper: formata capa em URL pública ──────────────────────────────────────
function coverUrl(coverId, size = "cover_big") {
  if (!coverId) return null;
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${coverId}.jpg`;
}

// ── Helper: formata screenshot em URL pública ────────────────────────────────
function screenshotUrl(imageId, size = "screenshot_big") {
  if (!imageId) return null;
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
}

// ── Helper: formata plataformas abreviadas ───────────────────────────────────
function formatPlatforms(platforms = []) {
  const map = {
    6: "PC", 48: "PS4", 167: "PS5", 49: "XB1", 169: "XSX",
    130: "NSW", 34: "Android", 39: "iOS", 14: "Mac",
  };
  return platforms
    .map((p) => map[p.id] || p.abbreviation || p.name?.slice(0, 4))
    .filter(Boolean)
    .slice(0, 4);
}

// ── Helper: formata um jogo da IGDB para o padrão do frontend ────────────────
function formatGame(game) {
  return {
    id: game.id,
    name: game.name,
    released: game.first_release_date
      ? new Date(game.first_release_date * 1000).toISOString().slice(0, 10)
      : null,
    score: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
    rating: game.rating ? +(game.rating / 20).toFixed(2) : null,
    image: game.cover ? coverUrl(game.cover.image_id) : null,
    banner: game.screenshots?.[0]
      ? screenshotUrl(game.screenshots[0].image_id, "screenshot_huge")
      : game.cover
      ? coverUrl(game.cover.image_id, "screenshot_big")
      : null,
    platforms: formatPlatforms(game.platforms || []),
    genres: (game.genres || []).map((g) => g.name).slice(0, 3),
    developer: game.involved_companies
      ?.find((c) => c.developer)
      ?.company?.name || null,
    publisher: game.involved_companies
      ?.find((c) => c.publisher)
      ?.company?.name || null,
    description: game.summary || null,
    story: game.storyline || null,
    tags: (game.keywords || []).map((k) => k.name).slice(0, 8),
    playtime: game.game_modes ? null : null, // IGDB não tem playtime direto
    shots: (game.screenshots || [])
      .slice(0, 6)
      .map((s) => screenshotUrl(s.image_id)),
    videos: (game.videos || []).map((v) => ({
      name: v.name,
      youtube: `https://www.youtube.com/embed/${v.video_id}`,
    })),
    websites: (game.websites || []).map((w) => ({
      category: w.category,
      url: w.url,
    })),
    similar: (game.similar_games || []).slice(0, 6).map((g) => ({
      id: g.id,
      name: g.name,
      image: g.cover ? coverUrl(g.cover.image_id) : null,
    })),
  };
}

// Campos padrão para listagens
const LIST_FIELDS = `
  fields
    id, name, first_release_date, aggregated_rating, rating,
    cover.image_id,
    screenshots.image_id,
    platforms.id, platforms.abbreviation, platforms.name,
    genres.name;
`.trim();

// Campos completos para detalhe
const DETAIL_FIELDS = `
  fields
    id, name, first_release_date, aggregated_rating, rating,
    summary, storyline,
    cover.image_id,
    screenshots.image_id,
    platforms.id, platforms.abbreviation, platforms.name,
    genres.name,
    keywords.name,
    involved_companies.developer, involved_companies.publisher,
    involved_companies.company.name,
    videos.name, videos.video_id,
    websites.category, websites.url,
    similar_games.id, similar_games.name, similar_games.cover.image_id;
`.trim();

// ── GET /api/games — listagem geral com filtros ──────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sort = "aggregated_rating",        // popular por padrão
      order = "desc",
      genre,
      search,
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    const cacheKey = `list:${page}:${limit}:${sort}:${order}:${genre || ""}:${search || ""}`;

    // Cache hit?
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    let where = "where aggregated_rating != null & cover != null & version_parent = null";
    if (genre) where += ` & genres = (${genre})`;
    if (search) where = `search "${search}"; where cover != null`;

    const query = `
      ${LIST_FIELDS};
      ${where};
      ${search ? "" : `sort ${sort} ${order};`}
      limit ${Math.min(Number(limit), 40)};
      offset ${offset};
    `;

    const games = await igdbQuery("games", query);
    const result = { results: games.map(formatGame), page: Number(page) };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error("[/api/games]", err.message);
    res.status(500).json({ error: "Erro ao buscar jogos" });
  }
});

// ── GET /api/games/popular — top jogos por rating ────────────────────────────
router.get("/popular", async (req, res) => {
  try {
    const cached = cache.get("popular");
    if (cached) return res.json(cached);

    const query = `
      ${LIST_FIELDS};
      where aggregated_rating > 75 & aggregated_rating_count > 5 & cover != null & version_parent = null;
      sort aggregated_rating desc;
      limit 20;
    `;

    const games = await igdbQuery("games", query);
    const result = games.map(formatGame);
    cache.set("popular", result);
    res.json(result);
  } catch (err) {
    console.error("[/api/games/popular]", err.message);
    res.status(500).json({ error: "Erro ao buscar populares" });
  }
});

// ── GET /api/games/recent — lançamentos recentes ─────────────────────────────
router.get("/recent", async (req, res) => {
  try {
    const cached = cache.get("recent");
    if (cached) return res.json(cached);

    // Timestamp de 2 anos atrás
    const twoYearsAgo = Math.floor(Date.now() / 1000) - 2 * 365 * 24 * 3600;
    const now = Math.floor(Date.now() / 1000);

    const query = `
      ${LIST_FIELDS};
      where first_release_date > ${twoYearsAgo}
        & first_release_date < ${now}
        & cover != null
        & version_parent = null
        & category = 0;
      sort first_release_date desc;
      limit 20;
    `;

    const games = await igdbQuery("games", query);
    const result = games.map(formatGame);
    cache.set("recent", result);
    res.json(result);
  } catch (err) {
    console.error("[/api/games/recent]", err.message);
    res.status(500).json({ error: "Erro ao buscar recentes" });
  }
});

// ── GET /api/games/top-rated — mais bem avaliados (Metacritic) ───────────────
router.get("/top-rated", async (req, res) => {
  try {
    const cached = cache.get("top-rated");
    if (cached) return res.json(cached);

    const query = `
      ${LIST_FIELDS};
      where aggregated_rating >= 85 & aggregated_rating_count >= 10 & cover != null & version_parent = null;
      sort aggregated_rating desc;
      limit 20;
    `;

    const games = await igdbQuery("games", query);
    const result = games.map(formatGame);
    cache.set("top-rated", result);
    res.json(result);
  } catch (err) {
    console.error("[/api/games/top-rated]", err.message);
    res.status(500).json({ error: "Erro ao buscar top rated" });
  }
});

// ── GET /api/games/genres — lista de gêneros com imagem ──────────────────────
router.get("/genres", async (req, res) => {
  try {
    const cached = cache.get("genres");
    if (cached) return res.json(cached);

    const query = `
      fields id, name, slug, games_count, url;
      limit 15;
    `;

    const genres = await igdbQuery("genres", query);

    // Para cada gênero, busca um jogo com capa para usar como imagem
    const enriched = await Promise.all(
      genres.map(async (g) => {
        try {
          const games = await igdbQuery(
            "games",
            `fields cover.image_id; where genres = (${g.id}) & cover != null & aggregated_rating > 80; sort aggregated_rating desc; limit 1;`
          );
          return {
            ...g,
            image: games[0]?.cover ? coverUrl(games[0].cover.image_id, "screenshot_big") : null,
          };
        } catch {
          return { ...g, image: null };
        }
      })
    );

    cache.set("genres", enriched, 3600); // cache 1h para gêneros
    res.json(enriched);
  } catch (err) {
    console.error("[/api/games/genres]", err.message);
    res.status(500).json({ error: "Erro ao buscar gêneros" });
  }
});

// ── GET /api/games/search?q=... — busca por nome ─────────────────────────────
router.get("/search", async (req, res) => {
  try {
    const { q, page = 1 } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: "Busca muito curta" });
    }

    const offset = (Number(page) - 1) * 20;
    const cacheKey = `search:${q.toLowerCase()}:${page}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const query = `
      search "${q.trim()}";
      ${LIST_FIELDS};
      where cover != null & version_parent = null;
      limit 20;
      offset ${offset};
    `;

    const games = await igdbQuery("games", query);
    const result = { results: games.map(formatGame), query: q };

    cache.set(cacheKey, result, 120); // cache 2min para buscas
    res.json(result);
  } catch (err) {
    console.error("[/api/games/search]", err.message);
    res.status(500).json({ error: "Erro ao buscar" });
  }
});

// ── GET /api/games/:id — detalhe completo ────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!Number.isInteger(Number(id))) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const cacheKey = `detail:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const query = `
      ${DETAIL_FIELDS};
      where id = ${id};
      limit 1;
    `;

    const games = await igdbQuery("games", query);
    if (!games.length) return res.status(404).json({ error: "Jogo não encontrado" });

    const result = formatGame(games[0]);
    cache.set(cacheKey, result, 600); // cache 10min para detalhes
    res.json(result);
  } catch (err) {
    console.error("[/api/games/:id]", err.message);
    res.status(500).json({ error: "Erro ao buscar jogo" });
  }
});

module.exports = router;
