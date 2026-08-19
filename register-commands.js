// Run this once (and again whenever you change command definitions):
//   node register-commands.js
//
// Registers commands scoped to DISCORD_GUILD_ID, which makes them available
// instantly in that server (global commands can take up to an hour to appear).

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
    new SlashCommandBuilder()
        .setName("genkey")
        .setDescription("Generate one or more Ovard license keys")
        .addIntegerOption((o) => o.setName("count").setDescription("How many keys (default 1)").setMinValue(1).setMaxValue(50))
        .addStringOption((o) => o.setName("note").setDescription("Note, e.g. buyer name or order id"))
        .addUserOption((o) => o.setName("for").setDescription("DM the key to this user"))
        .toJSON(),

    new SlashCommandBuilder()
        .setName("resetkey")
        .setDescription("Unbind a key's HWID so it can activate on a new machine")
        .addStringOption((o) => o.setName("key").setDescription("The license key").setRequired(true))
        .toJSON(),

    new SlashCommandBuilder()
        .setName("revokekey")
        .setDescription("Revoke a license key")
        .addStringOption((o) => o.setName("key").setDescription("The license key").setRequired(true))
        .toJSON(),

    new SlashCommandBuilder()
        .setName("unrevokekey")
        .setDescription("Un-revoke a previously revoked key")
        .addStringOption((o) => o.setName("key").setDescription("The license key").setRequired(true))
        .toJSON(),

    new SlashCommandBuilder()
        .setName("keyinfo")
        .setDescription("Look up a key's status")
        .addStringOption((o) => o.setName("key").setDescription("The license key").setRequired(true))
        .toJSON(),

    new SlashCommandBuilder()
        .setName("liststats")
        .setDescription("Show totals: how many keys exist, activated, revoked")
        .toJSON(),
];

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
            { body: commands }
        );
        console.log("Slash commands registered.");
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
