// Ovard license server — HTTP API the jar's LicenseGate talks to, plus the
// same admin endpoints as before (kept for curl/scripting access; the Discord
// bot in bot.js wraps the same keystore.js logic for slash-command access).
//
// Endpoints:
//   POST /api/verify           { key, hwid }              -> { valid, message? }
//   POST /api/admin/generate   { count, note }             -> { keys: [...] }   (admin auth)
//   POST /api/admin/reset      { key }                     -> { ok: true }      (admin auth, unbinds HWID)
//   POST /api/admin/revoke     { key }                     -> { ok: true }      (admin auth)
//   GET  /api/admin/keys                                   -> { keys: [...] }   (admin auth)
//
// Admin routes require header:  X-Admin-Token: <ADMIN_TOKEN env var>

const express = require("express");
const keystore = require("./keystore");

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me";
const PORT = process.env.PORT || 3000;

function requireAdmin(req, res, next) {
    if (req.header("X-Admin-Token") !== ADMIN_TOKEN) {
        return res.status(401).json({ error: "unauthorized" });
    }
    next();
}

const app = express();
app.use(express.json());

app.post("/api/verify", (req, res) => {
    const { key, hwid } = req.body || {};
    res.json(keystore.verify(key, hwid));
});

app.post("/api/admin/generate", requireAdmin, (req, res) => {
    const count = Math.min(Math.max(parseInt(req.body?.count, 10) || 1, 1), 500);
    const note = req.body?.note || "";
    res.json({ keys: keystore.generate(count, note) });
});

app.post("/api/admin/reset", requireAdmin, (req, res) => {
    const { key } = req.body || {};
    if (!keystore.reset(key)) return res.status(404).json({ error: "unknown key" });
    res.json({ ok: true });
});

app.post("/api/admin/revoke", requireAdmin, (req, res) => {
    const { key } = req.body || {};
    if (!keystore.revoke(key)) return res.status(404).json({ error: "unknown key" });
    res.json({ ok: true });
});

app.get("/api/admin/keys", requireAdmin, (req, res) => {
    res.json({ keys: keystore.all() });
});

app.get("/", (req, res) => res.send("Ovard license server is running."));

app.listen(PORT, () => {
    console.log(`Ovard license server listening on :${PORT}`);
    if (ADMIN_TOKEN === "change-me") {
        console.warn("WARNING: ADMIN_TOKEN is unset — set it before exposing this publicly.");
    }
});

// Start the Discord bot in the same process, if configured. Keeping both in
// one process means they're always deployed together on Railway with zero
// extra setup — one service, one `npm start`.
if (process.env.DISCORD_BOT_TOKEN) {
    require("./bot");
} else {
    console.log("DISCORD_BOT_TOKEN not set — Discord bot disabled, HTTP API only.");
}
