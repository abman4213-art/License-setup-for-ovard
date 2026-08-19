// Discord admin bot for the Ovard license server. Wraps keystore.js so the
// bot and the HTTP API (server.js) always agree on key state — same db.json,
// same functions, no separate logic to keep in sync.
//
// Required env vars:
//   DISCORD_BOT_TOKEN   bot token from the Discord Developer Portal
//   DISCORD_CLIENT_ID   application ID (same portal, "General Information")
//   DISCORD_GUILD_ID    your server's ID (for instant guild-scoped commands)
//   ADMIN_ROLE_ID       role ID allowed to run key-management commands
//
// Register the slash commands once (and again any time you edit this file's
// command definitions) by running:
//   node register-commands.js

const { Client, GatewayIntentBits, MessageFlags } = require("discord.js");
const keystore = require("./keystore");

const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function isAdmin(interaction) {
    if (!ADMIN_ROLE_ID) return false;
    return interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID);
}

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (!isAdmin(interaction)) {
        return interaction.reply({
            content: "You don't have permission to use this command.",
            flags: MessageFlags.Ephemeral,
        });
    }

    try {
        switch (interaction.commandName) {
            case "genkey": {
                const count = interaction.options.getInteger("count") ?? 1;
                const note = interaction.options.getString("note") ?? "";
                const forUser = interaction.options.getUser("for");

                const keys = keystore.generate(count, note, forUser?.id);
                const list = keys.map((k) => `\`${k}\``).join("\n");

                await interaction.reply({
                    content: `Generated ${keys.length} key(s):\n${list}`,
                    flags: MessageFlags.Ephemeral,
                });

                if (forUser) {
                    try {
                        await forUser.send(
                            `Here's your Ovard license key:\n\`${keys[0]}\`\n\n` +
                            `Paste it into \`config/ovard-license.txt\` next to your game and restart.`
                        );
                        await interaction.followUp({
                            content: `Sent the key to ${forUser.tag} by DM.`,
                            flags: MessageFlags.Ephemeral,
                        });
                    } catch {
                        await interaction.followUp({
                            content: `Generated the key, but couldn't DM ${forUser.tag} (DMs closed?). Send it manually.`,
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                }
                break;
            }

            case "resetkey": {
                const key = interaction.options.getString("key", true);
                const ok = keystore.reset(key);
                await interaction.reply({
                    content: ok ? `Unbound \`${key}\` — it can now activate on a new machine.` : `Unknown key.`,
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }

            case "revokekey": {
                const key = interaction.options.getString("key", true);
                const ok = keystore.revoke(key);
                await interaction.reply({
                    content: ok ? `Revoked \`${key}\`.` : `Unknown key.`,
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }

            case "unrevokekey": {
                const key = interaction.options.getString("key", true);
                const ok = keystore.unrevoke(key);
                await interaction.reply({
                    content: ok ? `Un-revoked \`${key}\`.` : `Unknown key.`,
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }

            case "keyinfo": {
                const key = interaction.options.getString("key", true);
                const rec = keystore.info(key);
                if (!rec) {
                    await interaction.reply({ content: "Unknown key.", flags: MessageFlags.Ephemeral });
                    break;
                }
                await interaction.reply({
                    content:
                        `\`${key}\`\n` +
                        `HWID bound: ${rec.hwid ? "yes" : "no"}\n` +
                        `Revoked: ${rec.revoked ? "yes" : "no"}\n` +
                        `Note: ${rec.note || "(none)"}\n` +
                        `Created: ${rec.createdAt}\n` +
                        (rec.activatedAt ? `Activated: ${rec.activatedAt}\n` : "") +
                        (rec.lastSeenAt ? `Last seen: ${rec.lastSeenAt}\n` : ""),
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }

            case "liststats": {
                const all = keystore.all();
                const total = Object.keys(all).length;
                const activated = Object.values(all).filter((r) => r.hwid).length;
                const revoked = Object.values(all).filter((r) => r.revoked).length;
                await interaction.reply({
                    content: `Total keys: ${total}\nActivated: ${activated}\nRevoked: ${revoked}`,
                    flags: MessageFlags.Ephemeral,
                });
                break;
            }
        }
    } catch (err) {
        console.error(err);
        const payload = { content: "Something went wrong running that command.", flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    }
});

client.once("clientReady", () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
