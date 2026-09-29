# Whitelist applications

[![Deploy to FadeHost](https://fadehost.com/deploy-button.svg)](https://laplace.fadehost.com/register?intent=app&repo=https://github.com/FadeHost/whitelist-applications)

[![Deploy on FadeHost](https://img.shields.io/badge/deploy%20on-FadeHost-0ea5e9?style=flat-square)](https://laplace.fadehost.com/bots?new=1)

A form where players apply to join your Minecraft server, and a page where you
read the applications and whitelist people with one click. No more collecting
names by hand out of a Discord channel.

- Players fill in their Minecraft name, their Discord name and why they want in
- You review at `/admin`, behind a password
- Approving runs `whitelist add <name>` on your server through the FadeHost API
- Denying is recorded too, so you know who you already turned down
- Every application and every decision can be posted to a Discord channel
- Applications live on the persistent volume, so a redeploy does not lose them

## Deploy on FadeHost

1. Open [Apps](https://laplace.fadehost.com/bots) in the panel and choose
   **Host an app**, then the **Whitelist applications** template.
2. Pick the server people are applying to and set an admin password.
3. Turn on the web address. The form is at `https://yourname.fadehost.app` and
   the review page at `https://yourname.fadehost.app/admin`.

Turn the whitelist on in your server first (`whitelist on` in the console, or
`white-list=true` in the server properties), or approving somebody changes
nothing.

## Environment variables

| Variable | Required | What it is |
|---|---|---|
| `FADEHOST_TOKEN` | yes | An access token with the **manage** scope, from [Profile, AI Access](https://laplace.fadehost.com/profile/ai-access). Manage is needed because approving runs a console command. |
| `SERVER_ID` | yes | The `server_…` id of the server to whitelist on. |
| `ADMIN_PASSWORD` | yes | The password for `/admin`. At least 8 characters; the app refuses to start without one. |
| `DISCORD_WEBHOOK_URL` | no | A Discord webhook. Every application and every decision is posted there. |
| `TITLE` | no | The heading on the form. Defaults to "Whitelist application". |
| `PORT` | no | The port to listen on. FadeHost sets this for you. |

## Run it somewhere else

```bash
npm install
FADEHOST_TOKEN=... SERVER_ID=server_... ADMIN_PASSWORD=... npm start
```

Then open `http://localhost:8080`. Node 20 or newer. Applications go in
`./data` when `/data` is not there.

## Routes

| Route | What it is |
|---|---|
| `/` | the application form |
| `/admin` | the review page, password protected |
| `/health` | `{ ok, server, pending, approved, denied }` for uptime checks |

## How it keeps you out of trouble

The Minecraft name is checked against what Mojang actually allows, 3 to 16
letters, digits and underscores, both when the form is submitted and again
right before the command is built. A name with a semicolon or a newline in it
never reaches your server console.

Approving only marks the application approved once the command has gone
through. If the server is asleep or stopped, you get the reason on screen and
the application stays pending, so you can try again once it is up.

The admin page is behind a signed, http-only, same-site cookie, every action
carries a token tied to that session, and the password is compared in constant
time. One application per address per ten minutes keeps the volume from filling
up.

## Where the data lives

```
/data/applications/<uuid>.json   one file per application
/data/session.key                signs the admin cookie
```

Both are on the volume that survives a redeploy. Back them up by copying the
folder.

## Tests

```bash
npm test
```

Built and maintained by [FadeHost](https://fadehost.com). MIT licensed.
