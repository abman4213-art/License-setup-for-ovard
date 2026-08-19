// Shared license key storage + logic, used by both server.js (HTTP API that the
// jar talks to) and bot.js (Discord admin commands). Keeping this in one place
// means the bot and the API can never disagree about what a key's state means.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "db.json");

function loadDb() {
    if (!fs.existsSync(DB_PATH)) return { keys: {} };
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveDb(db) {
    // Write to a temp file then rename, so a crash mid-write can't corrupt db.json.
    const tmp = DB_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_PATH);
}

function generateKeyString() {
    const part = () => crypto.randomBytes(2).toString("hex").toUpperCase();
    return `OVARD-${part()}-${part()}-${part()}-${part()}`;
}

/** Verify (and, on first use, activate) a key against a HWID. */
function verify(key, hwid) {
    if (!key || !hwid) return { valid: false, message: "Missing key or hwid" };

    const db = loadDb();
    const record = db.keys[key];

    if (!record) return { valid: false, message: "Unknown license key" };
    if (record.revoked) return { valid: false, message: "This key has been revoked" };

    if (!record.hwid) {
        record.hwid = hwid;
        record.activatedAt = new Date().toISOString();
        saveDb(db);
        return { valid: true, message: "Activated" };
    }

    if (record.hwid !== hwid) {
        return { valid: false, message: "Key already bound to a different machine" };
    }

    record.lastSeenAt = new Date().toISOString();
    saveDb(db);
    return { valid: true };
}

/** Create `count` fresh, unbound keys. Returns the array of new key strings. */
function generate(count, note, discordUserId) {
    const db = loadDb();
    const created = [];

    for (let i = 0; i < count; i++) {
        let key;
        do { key = generateKeyString(); } while (db.keys[key]);
        db.keys[key] = {
            hwid: null,
            note: note || "",
            discordUserId: discordUserId || null,
            revoked: false,
            createdAt: new Date().toISOString(),
        };
        created.push(key);
    }

    saveDb(db);
    return created;
}

/** Unbind a key's HWID so it can be activated on a new machine. */
function reset(key) {
    const db = loadDb();
    if (!db.keys[key]) return false;
    db.keys[key].hwid = null;
    saveDb(db);
    return true;
}

function revoke(key) {
    const db = loadDb();
    if (!db.keys[key]) return false;
    db.keys[key].revoked = true;
    saveDb(db);
    return true;
}

function unrevoke(key) {
    const db = loadDb();
    if (!db.keys[key]) return false;
    db.keys[key].revoked = false;
    saveDb(db);
    return true;
}

function info(key) {
    const db = loadDb();
    return db.keys[key] || null;
}

function all() {
    return loadDb().keys;
}

module.exports = { verify, generate, reset, revoke, unrevoke, info, all };
