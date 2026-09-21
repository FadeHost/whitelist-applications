// Optional Discord webhook posts. Nothing here ever throws into a request:
// a webhook that is down must not stop an approval.

/**
 * Post an embed to a Discord webhook.
 *
 * @param {string|undefined} url
 * @param {object} embed a Discord embed object
 */
export async function post(url, embed) {
  if (!url) return;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`[discord] webhook answered ${response.status}`);
    }
  } catch (error) {
    console.error(`[discord] ${error.message}`);
  }
}

/** A new application landed. */
export function submitted(application) {
  return {
    title: "New whitelist application",
    color: 0x38bdf8,
    fields: [
      { name: "Minecraft", value: code(application.minecraftName), inline: true },
      { name: "Discord", value: code(application.discordTag), inline: true },
      { name: "Why", value: trim(application.reason) },
    ],
    timestamp: application.createdAt,
  };
}

/** A decision was made. */
export function decided(application) {
  const approved = application.status === "approved";

  return {
    title: approved ? "Whitelisted" : "Application denied",
    color: approved ? 0x4ade80 : 0xf87171,
    fields: [
      { name: "Minecraft", value: code(application.minecraftName), inline: true },
      { name: "Discord", value: code(application.discordTag), inline: true },
      ...(application.decidedNote ? [{ name: "Console", value: trim(application.decidedNote, 300) }] : []),
    ],
    timestamp: application.decidedAt,
  };
}

// Backticks in somebody's answer would break out of the code span.
function code(value) {
  return `\`${String(value).replaceAll("`", "'")}\``;
}

function trim(value, max = 900) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text || "-";
}
