require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const gamesRouter = require("./routes/games");

const app = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "http://localhost:5173",
    methods: ["GET"],
  })
);

app.use(express.json());

// ── Rate limiting (proteção básica) ──────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60,             // 60 requests por minuto por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em 1 minuto." },
});
app.use(limiter);

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.use("/api/games", gamesRouter);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

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
  console.log(`   Client ID: ${process.env.TWITCH_CLIENT_ID ? "✓ configurado" : "✗ FALTANDO"}`);
  console.log(`   Client Secret: ${process.env.TWITCH_CLIENT_SECRET ? "✓ configurado" : "✗ FALTANDO"}`);
});
