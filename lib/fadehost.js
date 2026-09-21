// The one thing this app asks FadeHost to do: run a console command.

import { whitelistCommand } from "./validate.js";

export const API_BASE = process.env.FADEHOST_API || "https://api.fadehost.com/api";

/**
 * Run "whitelist add <name>" on the server and return what the console said.
 *
 * @param {object} options
 * @param {string} options.token an access token with the manage scope
 * @param {string} options.serverId a server_... id
 * @param {string} options.minecraftName
 * @returns {Promise<string>} the console output, possibly empty
 */
export async function whitelistAdd({ token, serverId, minecraftName }) {
  const command = whitelistCommand(minecraftName);

  const response = await fetch(`${API_BASE}/servers/${encodeURIComponent(serverId)}/console/command`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ consoleInput: command, rcon: true }),
    signal: AbortSignal.timeout(15000),
  });

  if (response.status === 401) {
    throw new Error(
      "FadeHost rejected the token. It needs the manage scope: mint a new one under Profile, AI Access.",
    );
  }

  if (response.status === 403) {
    throw new Error(
      "The server would not take the command. It has to be running, and the token needs the manage scope.",
    );
  }

  if (response.status === 404) {
    throw new Error(`No server with the id ${serverId} on this account.`);
  }

  if (!response.ok) {
    throw new Error(`FadeHost answered ${response.status} when running the command.`);
  }

  const body = await response.json().catch(() => ({}));
  return formatOutput(body.result);
}

/**
 * The API answers with an array of console lines (or an object keyed by line
 * number when it came back from RCON). Flatten it to one string.
 *
 * @param {unknown} result
 * @returns {string}
 */
export function formatOutput(result) {
  if (!result) return "";
  const lines = Array.isArray(result) ? result : Object.values(result);
  return lines.map((line) => String(line).trim()).filter(Boolean).join(" ");
}

/**
 * Check the token and the server id at boot, so a typo shows up in the
 * console on day one instead of on the first approval.
 *
 * @param {string} token
 * @param {string} serverId
 * @returns {Promise<{name: string}>}
 */
export async function checkServer(token, serverId) {
  const response = await fetch(`${API_BASE}/servers`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`FadeHost answered ${response.status} when listing your servers.`);
  }

  const servers = await response.json();
  const match = Array.isArray(servers) ? servers.find((s) => s.prefixed_id === serverId) : null;

  if (!match) {
    const known = (Array.isArray(servers) ? servers : []).map((s) => `${s.prefixed_id} (${s.name})`);
    throw new Error(
      `SERVER_ID ${serverId} is not on this account. Servers this token can see: ${known.join(", ") || "none"}.`,
    );
  }

  return { name: match.name };
}
