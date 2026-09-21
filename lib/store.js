// Applications on disk.
//
// One JSON file per application under <data>/applications. Files are boring,
// they survive a redeploy because /data does, and you can read or back them
// up with nothing but a file manager.

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Pick a directory to keep applications in.
 *
 * On FadeHost, /data is the volume that survives a redeploy; the app
 * directory itself is wiped and cloned again every time. Anywhere else, a
 * ./data folder next to the app.
 *
 * @param {string} [preferred]
 * @returns {string}
 */
export function resolveDataDir(preferred = process.env.DATA_DIR) {
  const candidates = [preferred, "/data", path.resolve("data")].filter(Boolean);

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      // Try the next one.
    }
  }

  throw new Error(`No writable data directory. Tried: ${candidates.join(", ")}`);
}

export const STATUSES = ["pending", "approved", "denied"];

export class Store {
  /** @param {string} dataDir */
  constructor(dataDir) {
    this.dir = path.join(dataDir, "applications");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Save a new application.
   *
   * @param {{minecraftName: string, discordTag: string, reason: string, ip?: string}} input
   * @returns {object} the stored application
   */
  create(input) {
    const application = {
      id: randomUUID(),
      minecraftName: input.minecraftName,
      discordTag: input.discordTag,
      reason: input.reason,
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
      decidedNote: null,
    };

    this.#write(application);
    return application;
  }

  /** @returns {object[]} newest first */
  all() {
    let names;
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return [];
    }

    return names
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.dir, name), "utf8"));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  /** @param {string} id */
  find(id) {
    if (!isId(id)) return null;
    try {
      return JSON.parse(fs.readFileSync(path.join(this.dir, `${id}.json`), "utf8"));
    } catch {
      return null;
    }
  }

  /**
   * Record a decision. Returns the updated application, or null when the id
   * is unknown or it was already decided.
   *
   * @param {string} id
   * @param {"approved"|"denied"} status
   * @param {string|null} [note] what happened, e.g. the console output
   */
  decide(id, status, note = null) {
    if (!STATUSES.includes(status) || status === "pending") return null;

    const application = this.find(id);
    if (!application || application.status !== "pending") return null;

    application.status = status;
    application.decidedAt = new Date().toISOString();
    application.decidedNote = note;

    this.#write(application);
    return application;
  }

  /** Whether this name already has an application that is not denied. */
  hasOpenApplication(minecraftName) {
    const wanted = String(minecraftName).toLowerCase();
    return this.all().some(
      (a) => a.minecraftName.toLowerCase() === wanted && a.status !== "denied",
    );
  }

  counts() {
    const counts = { pending: 0, approved: 0, denied: 0 };
    for (const application of this.all()) {
      if (counts[application.status] !== undefined) counts[application.status] += 1;
    }
    return counts;
  }

  #write(application) {
    if (!isId(application.id)) throw new Error("Refusing to write an application with a bad id.");

    // Write beside the target and rename, so a crash halfway through never
    // leaves half a file where a whole one used to be.
    const target = path.join(this.dir, `${application.id}.json`);
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(application, null, 2));
    fs.renameSync(temporary, target);
  }
}

// Ids are ours (randomUUID), so anything else is somebody poking at paths.
function isId(value) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}
