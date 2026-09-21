// Whitelist applications for a Minecraft server.
//
// Players fill in a form. You review them at /admin. Approving runs
// "whitelist add <name>" on the server through the FadeHost API, and both the
// application and the decision are kept on the persistent volume.

import express from "express";

import { clearCookie, issue, requireAdmin, sameSecret, sessionKey, setCookie, csrfToken, readCookie, verify } from "./lib/auth.js";
import { checkServer, whitelistAdd } from "./lib/fadehost.js";
import * as discord from "./lib/discord.js";
import { Store, resolveDataDir } from "./lib/store.js";
import { validateApplication } from "./lib/validate.js";
import { adminPage, applyPage, loginPage } from "./lib/views.js";

const PORT = Number(process.env.PORT || 8080);
const TOKEN = (process.env.FADEHOST_TOKEN || "").trim();
const SERVER_ID = (process.env.SERVER_ID || "").trim();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || "").trim();
const WEBHOOK = (process.env.DISCORD_WEBHOOK_URL || "").trim();
const TITLE = (process.env.TITLE || "Whitelist application").trim() || "Whitelist application";

function fatal(message) {
  console.error(`[config] ${message}`);
  process.exit(1);
}

if (!TOKEN) {
  fatal(
    "FADEHOST_TOKEN is not set. Create a token with the manage scope under Profile, AI Access " +
      "(https://laplace.fadehost.com/profile/ai-access), add it as an environment variable and restart.",
  );
}
if (!SERVER_ID) {
  fatal("SERVER_ID is not set. Put the id of the server to whitelist on, for example server_abc123.");
}
if (ADMIN_PASSWORD.length < 8) {
  fatal("ADMIN_PASSWORD is missing or too short. Use at least 8 characters: it is the only lock on /admin.");
}

const dataDir = resolveDataDir();
const store = new Store(dataDir);
const key = sessionKey(dataDir);

console.log(`[whitelist] keeping applications in ${dataDir}/applications`);

// The server name, once we have confirmed the token and the id work.
let serverName = null;
checkServer(TOKEN, SERVER_ID)
  .then(({ name }) => {
    serverName = name;
    console.log(`[whitelist] approvals go to ${name} (${SERVER_ID})`);
  })
  .catch((error) => {
    // Not fatal: the form should keep taking applications even when FadeHost
    // is having a moment. Approvals will say what is wrong.
    console.error(`[whitelist] ${error.message}`);
  });

// One application per address per ten minutes, so a bored visitor cannot fill
// the volume. In memory on purpose: a restart forgiving somebody is fine.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const lastSubmission = new Map();

function rateLimited(ip) {
  const previous = lastSubmission.get(ip);
  if (previous && Date.now() - previous < RATE_WINDOW_MS) return true;

  lastSubmission.set(ip, Date.now());
  if (lastSubmission.size > 5000) lastSubmission.clear();
  return false;
}

const app = express();
app.disable("x-powered-by");
// The FadeHost web address terminates TLS in front of this app.
app.set("trust proxy", true);
app.use(express.urlencoded({ extended: false, limit: "16kb" }));

const secureCookies = Boolean(process.env.APP_URL?.startsWith("https://"));

// ---- the public form -----------------------------------------------------

app.get("/", (_req, res) => {
  res.type("html").send(applyPage({ title: TITLE, values: {}, errors: {} }));
});

app.post("/apply", async (req, res) => {
  const result = validateApplication(req.body);

  if (!result.ok) {
    res.status(422).type("html").send(applyPage({ title: TITLE, values: req.body, errors: result.errors }));
    return;
  }

  if (store.hasOpenApplication(result.value.minecraftName)) {
    res.status(409).type("html").send(
      applyPage({
        title: TITLE,
        values: req.body,
        errors: { form: "There is already an application for that name. Hang on for an answer." },
      }),
    );
    return;
  }

  if (rateLimited(req.ip)) {
    res.status(429).type("html").send(
      applyPage({
        title: TITLE,
        values: req.body,
        errors: { form: "You have just sent one. Give it ten minutes before sending another." },
      }),
    );
    return;
  }

  const application = store.create(result.value);
  console.log(`[apply] ${application.minecraftName} (${application.discordTag})`);

  discord.post(WEBHOOK, discord.submitted(application));

  res.type("html").send(applyPage({ title: TITLE, sent: true }));
});

// ---- the admin side ------------------------------------------------------

app.get("/admin/login", (req, res) => {
  if (verify(key, readCookie(req.headers.cookie, "wl_admin"))) {
    res.redirect("/admin");
    return;
  }
  res.type("html").send(loginPage());
});

app.post("/admin/login", (req, res) => {
  const password = String(req.body?.password ?? "");

  if (!sameSecret(password, ADMIN_PASSWORD)) {
    console.log(`[admin] failed sign-in from ${req.ip}`);
    res.status(401).type("html").send(loginPage({ error: "Wrong password." }));
    return;
  }

  setCookie(res, issue(key), secureCookies);
  res.redirect("/admin");
});

const admin = requireAdmin(key);

app.get("/admin", admin, (req, res) => {
  const filter = ["pending", "approved", "denied"].includes(req.query.filter) ? req.query.filter : "pending";

  res.type("html").send(
    adminPage({
      applications: store.all().filter((a) => a.status === filter),
      counts: store.counts(),
      filter,
      csrf: req.csrfToken,
      serverName,
      notice: typeof req.query.ok === "string" ? req.query.ok : null,
      error: typeof req.query.error === "string" ? req.query.error : null,
    }),
  );
});

app.post("/admin/logout", admin, (req, res) => {
  if (!sameSecret(String(req.body?.csrf ?? ""), req.csrfToken)) {
    res.status(403).send("Bad token.");
    return;
  }
  clearCookie(res);
  res.redirect("/admin/login");
});

app.post("/admin/decide", admin, async (req, res) => {
  if (!sameSecret(String(req.body?.csrf ?? ""), req.csrfToken)) {
    res.status(403).send("Bad token.");
    return;
  }

  const id = String(req.body?.id ?? "");
  const decision = String(req.body?.decision ?? "");

  if (decision !== "approved" && decision !== "denied") {
    res.redirect("/admin?error=Unknown+decision.");
    return;
  }

  const application = store.find(id);
  if (!application || application.status !== "pending") {
    res.redirect("/admin?error=That+application+was+already+decided.");
    return;
  }

  if (decision === "denied") {
    const denied = store.decide(id, "denied");
    discord.post(WEBHOOK, discord.decided(denied));
    res.redirect(`/admin?ok=${encodeURIComponent(`${application.minecraftName} was denied.`)}`);
    return;
  }

  // Approving is the only thing that touches the game server, so the command
  // has to succeed before the application counts as approved. A failure
  // leaves it pending, to be tried again once the server is up.
  let output;
  try {
    output = await whitelistAdd({ token: TOKEN, serverId: SERVER_ID, minecraftName: application.minecraftName });
  } catch (error) {
    console.error(`[approve] ${application.minecraftName}: ${error.message}`);
    res.redirect(`/admin?error=${encodeURIComponent(error.message)}`);
    return;
  }

  const approved = store.decide(id, "approved", output || null);
  console.log(`[approve] ${application.minecraftName}: ${output || "no console output"}`);

  discord.post(WEBHOOK, discord.decided(approved));

  res.redirect(`/admin?ok=${encodeURIComponent(`${application.minecraftName} is whitelisted.`)}`);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, server: serverName, ...store.counts() });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[whitelist] listening on ${PORT}`);
  if (process.env.APP_URL) {
    console.log(`[whitelist] form ${process.env.APP_URL} · admin ${process.env.APP_URL}/admin`);
  }
});
