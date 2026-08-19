# Ovard HWID licensing — how it all fits together

## What was changed in the jar

- `com/nnpg/ovard/OvardAddon.class` — bytecode-patched (not recompiled) so the very
  first thing `onInitialize()` does is call `LicenseGate.check()`. If that call
  fails, the whole game process exits before a single module gets registered.
  Nothing else in the class changed.
- `com/nnpg/ovard/LicenseGate.class` (+ two small inner classes) — new class, pure
  Java standard library only (HttpClient, MessageDigest, ProcessBuilder, regex). No
  Meteor/Fabric/Minecraft dependency, which is what let it be built and inserted
  without needing the full mod build environment.

Source for `LicenseGate` is in `LicenseGate.java` next to this README, in case you
want to hand it to whoever maintains the mod source tree and have it compiled in
properly next time you cut a build (cleaner than bytecode patching long-term).

## What it does on launch

1. Computes a HWID: Windows registry `MachineGuid` (falls back to MAC address /
   machine-id on other OSes), SHA-256 hashed — the raw hardware string is never
   sent anywhere, only the hash.
2. Reads a license key from `config/ovard-license.txt` next to the game. If that
   file doesn't exist, it creates a template and stops — so a buyer's first launch
   tells them exactly what to do.
3. POSTs `{key, hwid}` to your license server.
4. First successful check for a key binds it to that HWID server-side. Any other
   machine using the same key afterwards gets rejected.
5. If the server says invalid, or is unreachable and there's no valid recent cached
   check (72h grace period), the game process exits.

## 1. Point the client at your server

Right now `LicenseGate.java` has:

```java
private static final String API_ENDPOINT = "https://license.yourdomain.com/api/verify";
```

Swap in your real domain, then recompile just that file and re-run the same
bytecode patch step used to build the jar you already have (I can redo this for
you in a couple minutes once you tell me the real endpoint — just ask).

## 2. Deploy to Railway

Your Netlify site stays exactly as it is — this is a separate, always-on
service that Netlify can't run, so it needs its own host. Railway works well
for this and has a free trial tier.

1. Push the `license-server/` folder to a GitHub repo (Railway deploys from git).
2. On [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
   → pick that repo.
3. Railway auto-detects Node and runs `npm install && npm start`. No config needed
   for that part.
4. Under **Variables**, add:
   - `ADMIN_TOKEN` — a long random string, this guards the admin API and is
     separate from the Discord bot's permission check.
   - `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `ADMIN_ROLE_ID`
     — see step 4 below. Leave these unset for now if you want to deploy the
     HTTP API first and add the bot later; it degrades gracefully (logs "bot
     disabled, HTTP API only" and keeps serving `/api/verify`).
5. Under **Settings → Networking**, click **Generate Domain**. Railway gives you
   a `https://your-app.up.railway.app` URL — that's `API_ENDPOINT` for
   `LicenseGate.java`.

One thing to know: Railway's default filesystem is **ephemeral** — `db.json`
gets wiped on redeploy. Fine while testing, not fine once you have real keys.
Before selling anything, either:
- add a [Railway Volume](https://docs.railway.com/reference/volumes) mounted at
  `/app` (or wherever `db.json` lives) so it persists across deploys, or
- swap `keystore.js`'s `loadDb`/`saveDb` for a real database (Railway offers a
  one-click Postgres addon) — more work, but the right move once this is
  actually generating revenue.

## 3. Set up the Discord bot

1. [Discord Developer Portal](https://discord.com/developers/applications) →
   **New Application** → name it (e.g. "Ovard License Bot").
2. **Bot** tab → **Reset Token** → copy it → this is `DISCORD_BOT_TOKEN`.
3. **General Information** tab → copy **Application ID** → this is `DISCORD_CLIENT_ID`.
4. **OAuth2 → URL Generator** → scopes: `bot`, `applications.commands` → no
   special bot permissions needed (it only sends replies/DMs) → open the
   generated URL and invite it to your server.
5. In Discord, enable Developer Mode (User Settings → Advanced), right-click
   your server icon → **Copy Server ID** → this is `DISCORD_GUILD_ID`. Right-click
   the role you want allowed to run key commands (e.g. "Staff") → **Copy Role ID**
   → this is `ADMIN_ROLE_ID`.
6. Add all four as Railway variables (step 2.4 above) and redeploy.
7. Register the slash commands once, from your own machine (they don't need to
   run on Railway — this just tells Discord's API what commands exist):
   ```bash
   cd license-server
   npm install
   DISCORD_BOT_TOKEN=... DISCORD_CLIENT_ID=... DISCORD_GUILD_ID=... npm run register-commands
   ```
   Re-run this any time you add/change a command in `bot.js`.

You now have `/genkey`, `/resetkey`, `/revokekey`, `/unrevokekey`, `/keyinfo`,
and `/liststats` in that Discord server, restricted to your admin role.

## 4. Selling a key

Run `/genkey count:1 note:"order #123" for:@buyer` — it generates the key,
replies to you privately with it, and DMs it straight to the buyer with
instructions to paste it into `config/ovard-license.txt`. Leave `for` off if
you'd rather copy/paste it yourself.

## 5. If a buyer gets a new PC

`/resetkey key:OVARD-A1B2-C3D4-E5F6-0102` — unbinds the key so it can activate
on the new machine.

## 6. Revoke a leaked/refunded key

`/revokekey key:OVARD-A1B2-C3D4-E5F6-0102`

## The admin HTTP endpoints still work too

Everything the bot does is also reachable directly (useful for scripting or if
you ever want a web dashboard instead):

```bash
curl -X POST https://your-app.up.railway.app/api/admin/generate \
  -H "X-Admin-Token: your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"count": 10, "note": "batch8 buyers"}'
```

## Honest limitations

- This stops casual sharing (someone can't just hand the key or jar to a friend
  on a different PC). It will **not** stop a determined reverse engineer — they
  can decompile `LicenseGate`, patch out the `exit(1)` call, or point
  `API_ENDPOINT` at a fake server that always says valid. Bytecode obfuscation
  (e.g. running the jar through Proguard) raises the effort required but doesn't
  make it unbreakable — nothing client-side does.
- HWID via Windows `MachineGuid` is stable across reboots but changes on a clean
  Windows reinstall — expect occasional legitimate reset requests.
