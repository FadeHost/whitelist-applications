// What the form accepts.
//
// The Minecraft name ends up inside a console command, so it is checked hard:
// only the characters Mojang allows, nothing else, ever. Everything that
// leaves this file has already been through that check.

/** Mojang names: 3 to 16 characters, letters, digits and underscore. */
export const MINECRAFT_NAME = /^[A-Za-z0-9_]{3,16}$/;

/** Discord names are loose, so only length and obvious junk are checked. */
export const DISCORD_TAG = /^[^\s@#:][^\s]{1,36}$|^[^\s]{2,37}#\d{4}$/;

export const REASON_MIN = 20;
export const REASON_MAX = 1000;

/**
 * Check one submitted form.
 *
 * @param {Record<string, unknown>} body
 * @returns {{ok: true, value: {minecraftName: string, discordTag: string, reason: string}} | {ok: false, errors: Record<string, string>}}
 */
export function validateApplication(body) {
  const errors = {};

  const minecraftName = String(body.minecraftName ?? "").trim();
  const discordTag = String(body.discordTag ?? "").trim();
  const reason = String(body.reason ?? "").trim();

  if (!MINECRAFT_NAME.test(minecraftName)) {
    errors.minecraftName =
      "That is not a Minecraft name. Names are 3 to 16 characters: letters, numbers and underscores.";
  }

  if (!DISCORD_TAG.test(discordTag)) {
    errors.discordTag = "Put in your Discord name, for example yourname or yourname#1234.";
  }

  if (reason.length < REASON_MIN) {
    errors.reason = `Tell us a little more, at least ${REASON_MIN} characters.`;
  } else if (reason.length > REASON_MAX) {
    errors.reason = `That is too long, keep it under ${REASON_MAX} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, value: { minecraftName, discordTag, reason } };
}

/**
 * The console command for an approved application.
 *
 * It refuses anything the name check would not have passed, so a name that
 * somehow got into storage by another route still cannot carry a second
 * command along with it.
 *
 * @param {string} minecraftName
 * @returns {string}
 */
export function whitelistCommand(minecraftName) {
  if (!MINECRAFT_NAME.test(String(minecraftName))) {
    throw new Error(`Refusing to run a command for the name ${JSON.stringify(minecraftName)}.`);
  }
  return `whitelist add ${minecraftName}`;
}
