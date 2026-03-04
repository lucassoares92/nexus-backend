require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const gamesRouter = require("./routes/games");

const app = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────────────────────
// Suporta múltiplas origens separadas por vírgula no ALLOWED_ORIGINS
// Ex: ALLOWED_ORIGINS=https://lime-swan-541176.hostingersite.com,https://meusite.com
const rawOrigins =
  process.env.ALLOWED_ORIGINS ||
  process.env.ALLOWED_ORIGIN ||
  "http://localhost:5173";
const allowedOrigins = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

console.log("[CORS] Origens permitidas:", allowedOrigins);

const corsOptions = {
  origin: (origin, callback) => {
    // Permite requests sem origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Bloqueado: ${origin}`);
      callback(new Error(`CORS: origem não permitida`));
    }
  },
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
};

// Aplica CORS em todas as rotas, incluindo preflight OPTIONS
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em 1 minuto." },
});
app.use(limiter);

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.use("/api/games", gamesRouter);

// Health check — mostra as origens permitidas para facilitar debug
app.get("/health", (req, res) => res.json({ status: "ok", allowedOrigins }));

// 404
app.use((req, res) => res.status(404).json({ error: "Rota não encontrada" }));

// Error handler
app.use((err, req, res, next) => {
  console.error("[Error]", err.message);
  res.status(500).json({ error: "Erro interno do servidor" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ NEXUS Backend rodando em http://localhost:${PORT}`);
  console.log(
    `   Client ID: ${process.env.TWITCH_CLIENT_ID ? "✓ configurado" : "✗ FALTANDO"}`,
  );
  console.log(
    `   Client Secret: ${process.env.TWITCH_CLIENT_SECRET ? "✓ configurado" : "✗ FALTANDO"}`,
  );
});
