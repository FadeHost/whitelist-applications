import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { csrfToken, issue, readCookie, sameSecret, sessionKey, verify } from "../lib/auth.js";
import { formatOutput } from "../lib/fadehost.js";
import { Store, resolveDataDir } from "../lib/store.js";
import { validateApplication, whitelistCommand } from "../lib/validate.js";
import { escapeHtml, adminPage, applyPage } from "../lib/views.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "whitelist-test-"));
}

const good = {
  minecraftName: "Notch",
  discordTag: "notch",
  reason: "I have played on servers like this for years and would like to build here.",
};

// ---- validation ----------------------------------------------------------

test("a good application passes", () => {
  const result = validateApplication(good);
  assert.equal(result.ok, true);
  assert.equal(result.value.minecraftName, "Notch");
});

test("a name with a space is refused", () => {
  const result = validateApplication({ ...good, minecraftName: "Not ch" });
  assert.equal(result.ok, false);
  assert.match(result.errors.minecraftName, /3 to 16 characters/);
});

test("a name that carries a second command is refused", () => {
  for (const name of ["Notch; op Evil", "Notch\nop Evil", "Notch op Evil", "../../etc/passwd", "a".repeat(17)]) {
    assert.equal(validateApplication({ ...good, minecraftName: name }).ok, false, name);
  }
});

test("a short reason is refused", () => {
  const result = validateApplication({ ...good, reason: "pls" });
  assert.equal(result.ok, false);
  assert.match(result.errors.reason, /at least 20/);
});

test("a very long reason is refused", () => {
  assert.equal(validateApplication({ ...good, reason: "x".repeat(1001) }).ok, false);
});

test("both old and new style Discord names pass", () => {
  assert.equal(validateApplication({ ...good, discordTag: "notch#1234" }).ok, true);
  assert.equal(validateApplication({ ...good, discordTag: "notch.official" }).ok, true);
});

test("an empty Discord name is refused", () => {
  assert.equal(validateApplication({ ...good, discordTag: "" }).ok, false);
});

test("whitelistCommand builds the command for a valid name", () => {
  assert.equal(whitelistCommand("jeb_"), "whitelist add jeb_");
});

test("whitelistCommand refuses anything else, whatever got it into storage", () => {
  assert.throws(() => whitelistCommand("Notch; op Evil"), /Refusing to run a command/);
  assert.throws(() => whitelistCommand(""), /Refusing to run a command/);
});

// ---- storage -------------------------------------------------------------

test("an application is stored and comes back", () => {
  const store = new Store(tempDir());
  const created = store.create(good);

  assert.equal(created.status, "pending");
  assert.equal(store.find(created.id).minecraftName, "Notch");
  assert.equal(store.all().length, 1);
});

test("storage survives a new Store over the same directory, like a redeploy", () => {
  const dir = tempDir();
  const created = new Store(dir).create(good);

  const after = new Store(dir);
  assert.equal(after.find(created.id).minecraftName, "Notch");
  assert.deepEqual(after.counts(), { pending: 1, approved: 0, denied: 0 });
});

test("a decision sticks and cannot be made twice", () => {
  const store = new Store(tempDir());
  const created = store.create(good);

  const approved = store.decide(created.id, "approved", "Added Notch to the whitelist");
  assert.equal(approved.status, "approved");
  assert.equal(approved.decidedNote, "Added Notch to the whitelist");
  assert.ok(approved.decidedAt);

  assert.equal(store.decide(created.id, "denied"), null);
  assert.equal(store.find(created.id).status, "approved");
});

test("an unknown or malformed id gets nothing back", () => {
  const store = new Store(tempDir());
  assert.equal(store.find("../../../etc/passwd"), null);
  assert.equal(store.find("nope"), null);
  assert.equal(store.decide("nope", "approved"), null);
});

test("a pending or approved name blocks a second application, a denied one does not", () => {
  const store = new Store(tempDir());
  const created = store.create(good);

  assert.equal(store.hasOpenApplication("notch"), true);

  store.decide(created.id, "denied");
  assert.equal(store.hasOpenApplication("Notch"), false);
});

test("applications come back newest first", async () => {
  const store = new Store(tempDir());
  store.create({ ...good, minecraftName: "First" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  store.create({ ...good, minecraftName: "Second" });

  assert.deepEqual(store.all().map((a) => a.minecraftName), ["Second", "First"]);
});

test("resolveDataDir uses the directory it is given", () => {
  const dir = tempDir();
  assert.equal(resolveDataDir(dir), dir);
});

// ---- sessions ------------------------------------------------------------

test("a cookie we minted verifies, a tampered one does not", () => {
  const key = sessionKey(tempDir());
  const cookie = issue(key);

  assert.equal(verify(key, cookie), true);
  assert.equal(verify(key, cookie.replace(/.$/, "x")), false);
  assert.equal(verify(key, "9999999999999.nonsense"), false);
  assert.equal(verify(key, undefined), false);
});

test("an expired cookie does not verify", () => {
  const key = sessionKey(tempDir());
  const cookie = issue(key, Date.now() - 48 * 60 * 60 * 1000);
  assert.equal(verify(key, cookie), false);
});

test("a cookie minted with another key does not verify", () => {
  const cookie = issue(sessionKey(tempDir()));
  assert.equal(verify(sessionKey(tempDir()), cookie), false);
});

test("the signing key survives a restart", () => {
  const dir = tempDir();
  const cookie = issue(sessionKey(dir));
  assert.equal(verify(sessionKey(dir), cookie), true);
});

test("the csrf token is tied to the session", () => {
  const key = sessionKey(tempDir());
  const a = issue(key, Date.now());
  const b = issue(key, Date.now() + 1000);
  assert.notEqual(csrfToken(key, a), csrfToken(key, b));
});

test("sameSecret compares without throwing on different lengths", () => {
  assert.equal(sameSecret("abc", "abc"), true);
  assert.equal(sameSecret("abc", "abcd"), false);
  assert.equal(sameSecret("", "x"), false);
});

test("readCookie picks one cookie out of the header", () => {
  assert.equal(readCookie("a=1; wl_admin=xyz; b=2", "wl_admin"), "xyz");
  assert.equal(readCookie(undefined, "wl_admin"), undefined);
  assert.equal(readCookie("a=1", "wl_admin"), undefined);
});

// ---- odds and ends -------------------------------------------------------

test("console output is flattened whichever shape it arrives in", () => {
  assert.equal(formatOutput(["Added Notch to the whitelist"]), "Added Notch to the whitelist");
  assert.equal(formatOutput({ 0: "Added Notch", 1: "" }), "Added Notch");
  assert.equal(formatOutput(null), "");
});

test("what a player typed cannot inject markup into the admin page", () => {
  const html = adminPage({
    applications: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        minecraftName: "Notch",
        discordTag: '<img src=x onerror="alert(1)">',
        reason: "<script>alert(1)</script>",
        status: "pending",
        createdAt: "2026-09-21T10:00:00.000Z",
      },
    ],
    counts: { pending: 1, approved: 0, denied: 0 },
    filter: "pending",
    csrf: "token",
  });

  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("<script>alert(1)"), false);
  assert.match(html, /&lt;script&gt;/);
});

test("the form keeps what was typed when it comes back with errors", () => {
  const html = applyPage({
    title: "Whitelist",
    values: { minecraftName: "Not ch", discordTag: "", reason: "" },
    errors: { minecraftName: "That is not a Minecraft name." },
  });

  assert.match(html, /value="Not ch"/);
  assert.match(html, /That is not a Minecraft name/);
});

test("escapeHtml covers the characters that matter", () => {
  assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});
