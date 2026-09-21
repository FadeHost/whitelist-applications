// Every page this app serves. Plain HTML, one stylesheet, no build step.

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLE = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 40px 20px 64px;
  background: #0b0b0f; color: #e7e7ea;
  font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.wrap { max-width: 640px; margin: 0 auto; }
.wrap.wide { max-width: 900px; }
h1 { font-size: 26px; font-weight: 600; margin: 0 0 6px; letter-spacing: -0.01em; }
.sub { color: #8b8b95; font-size: 14px; margin: 0 0 28px; }
.card {
  background: #131318; border: 1px solid #23232c;
  border-radius: 14px; padding: 20px;
}
.card + .card { margin-top: 14px; }
label { display: block; font-size: 14px; font-weight: 500; margin: 0 0 6px; }
.hint { color: #8b8b95; font-weight: 400; font-size: 13px; }
input, textarea {
  width: 100%; background: #0f0f14; color: #e7e7ea;
  border: 1px solid #2c2c36; border-radius: 9px;
  padding: 10px 12px; font: inherit; font-size: 15px;
}
input:focus, textarea:focus { outline: 2px solid #0ea5e9; outline-offset: -1px; border-color: transparent; }
textarea { min-height: 120px; resize: vertical; }
.field + .field { margin-top: 18px; }
button {
  background: #0ea5e9; color: #04131c; border: 0;
  border-radius: 9px; padding: 11px 18px;
  font: inherit; font-weight: 600; cursor: pointer;
}
button:hover { background: #38bdf8; }
button.ghost { background: #23232c; color: #e7e7ea; }
button.ghost:hover { background: #2f2f3a; }
button.deny { background: #3f1d1d; color: #fca5a5; }
button.deny:hover { background: #5b2626; }
.actions { margin-top: 22px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.err { color: #fca5a5; font-size: 13px; margin: 6px 0 0; }
.banner { border-radius: 11px; padding: 13px 15px; font-size: 14px; margin: 0 0 20px; }
.banner.ok { background: #4ade801a; border: 1px solid #4ade8040; color: #86efac; }
.banner.bad { background: #f871711a; border: 1px solid #f8717140; color: #fca5a5; }
.app { border-top: 1px solid #23232c; padding: 16px 0; }
.app:first-of-type { border-top: 0; padding-top: 0; }
.app-top { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap; }
.who { font-size: 17px; font-weight: 600; margin: 0; overflow-wrap: anywhere; }
.meta { color: #8b8b95; font-size: 13px; margin: 3px 0 0; overflow-wrap: anywhere; }
.reason { margin: 11px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; color: #c9c9d1; font-size: 14px; }
.tag { font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.tag.pending { background: #fbbf241a; color: #fbbf24; }
.tag.approved { background: #4ade801a; color: #4ade80; }
.tag.denied { background: #9ca3af14; color: #9ca3af; }
.row-actions { margin-top: 12px; display: flex; gap: 8px; }
.row-actions form { display: inline; }
.tabs { display: flex; gap: 8px; margin: 0 0 18px; flex-wrap: wrap; }
.tabs a {
  font-size: 14px; text-decoration: none; color: #b4b4bd;
  background: #16161c; border: 1px solid #23232c;
  padding: 7px 13px; border-radius: 999px;
}
.tabs a.on { background: #0ea5e91a; border-color: #0ea5e955; color: #7dd3fc; }
.empty { color: #8b8b95; text-align: center; padding: 26px 0; }
.topbar { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
footer { margin-top: 32px; text-align: center; color: #6b6b75; font-size: 13px; }
footer a { color: #8b8b95; }
@media (max-width: 480px) { body { padding: 28px 14px 48px; } }
`;

function layout({ title, body, wide = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><div class="wrap${wide ? " wide" : ""}">${body}
<footer>Hosted on <a href="https://fadehost.com" rel="noreferrer">FadeHost</a></footer>
</div></body>
</html>`;
}

/** The public form. */
export function applyPage({ title, values = {}, errors = {}, sent = false }) {
  if (sent) {
    return layout({
      title,
      body: `<h1>${escapeHtml(title)}</h1>
<div class="banner ok">Application sent. Someone will look at it and you will hear back on Discord.</div>
<div class="card"><p style="margin:0;color:#b4b4bd">You can close this page now.</p></div>`,
    });
  }

  const field = (name, label, hint, control) => `
<div class="field">
  <label for="${name}">${label}${hint ? ` <span class="hint">${hint}</span>` : ""}</label>
  ${control}
  ${errors[name] ? `<p class="err">${escapeHtml(errors[name])}</p>` : ""}
</div>`;

  return layout({
    title,
    body: `<h1>${escapeHtml(title)}</h1>
<p class="sub">Fill this in and we will get back to you.</p>
${errors.form ? `<div class="banner bad">${escapeHtml(errors.form)}</div>` : ""}
<form method="post" action="/apply" class="card">
${field(
  "minecraftName",
  "Minecraft name",
  "exactly as it is in game",
  `<input id="minecraftName" name="minecraftName" required maxlength="16" autocomplete="off" spellcheck="false" value="${escapeHtml(values.minecraftName)}">`,
)}
${field(
  "discordTag",
  "Discord name",
  "so we can reach you",
  `<input id="discordTag" name="discordTag" required maxlength="37" autocomplete="off" value="${escapeHtml(values.discordTag)}">`,
)}
${field(
  "reason",
  "Why do you want to join?",
  "a few sentences",
  `<textarea id="reason" name="reason" required maxlength="1000">${escapeHtml(values.reason)}</textarea>`,
)}
<div class="actions"><button type="submit">Send application</button></div>
</form>`,
  });
}

/** The admin login. */
export function loginPage({ error = null } = {}) {
  return layout({
    title: "Admin",
    body: `<h1>Admin</h1>
<p class="sub">Enter the admin password to review applications.</p>
${error ? `<div class="banner bad">${escapeHtml(error)}</div>` : ""}
<form method="post" action="/admin/login" class="card">
  <div class="field">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required autocomplete="current-password" autofocus>
  </div>
  <div class="actions"><button type="submit">Sign in</button></div>
</form>`,
  });
}

/** The review list. */
export function adminPage({ applications, counts, filter, csrf, notice = null, error = null, serverName = null }) {
  const tab = (key, label) =>
    `<a href="/admin?filter=${key}" class="${filter === key ? "on" : ""}">${label} ${counts[key] ?? 0}</a>`;

  const body = applications.length === 0
    ? `<div class="empty">Nothing here yet.</div>`
    : applications.map((a) => applicationRow(a, csrf)).join("");

  return layout({
    wide: true,
    title: "Whitelist admin",
    body: `<div class="topbar">
  <div>
    <h1>Whitelist admin</h1>
    <p class="sub">${serverName ? `Approving adds the player to ${escapeHtml(serverName)}.` : "Approving runs whitelist add on your server."}</p>
  </div>
  <form method="post" action="/admin/logout">
    <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
    <button class="ghost" type="submit">Sign out</button>
  </form>
</div>
${notice ? `<div class="banner ok">${escapeHtml(notice)}</div>` : ""}
${error ? `<div class="banner bad">${escapeHtml(error)}</div>` : ""}
<div class="tabs">${tab("pending", "Pending")}${tab("approved", "Approved")}${tab("denied", "Denied")}</div>
<div class="card">${body}</div>`,
  });
}

function applicationRow(application, csrf) {
  const when = new Date(application.createdAt);
  const decided = application.status !== "pending";

  const buttons = decided
    ? ""
    : `<div class="row-actions">
  <form method="post" action="/admin/decide">
    <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
    <input type="hidden" name="id" value="${escapeHtml(application.id)}">
    <input type="hidden" name="decision" value="approved">
    <button type="submit">Approve and whitelist</button>
  </form>
  <form method="post" action="/admin/decide">
    <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
    <input type="hidden" name="id" value="${escapeHtml(application.id)}">
    <input type="hidden" name="decision" value="denied">
    <button class="deny" type="submit">Deny</button>
  </form>
</div>`;

  const note = application.decidedNote
    ? `<p class="meta">Console: ${escapeHtml(application.decidedNote)}</p>`
    : "";

  return `<div class="app">
  <div class="app-top">
    <div>
      <p class="who">${escapeHtml(application.minecraftName)}</p>
      <p class="meta">${escapeHtml(application.discordTag)} · ${escapeHtml(when.toISOString().slice(0, 16).replace("T", " "))} UTC</p>
    </div>
    <span class="tag ${escapeHtml(application.status)}">${escapeHtml(application.status)}</span>
  </div>
  <p class="reason">${escapeHtml(application.reason)}</p>
  ${note}
  ${buttons}
</div>`;
}
