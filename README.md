# Nearby: local business booking (self-hosted)

Node.js + Express + SQLite, with **Sign in with Google** and an admin back end.

- **Clients:** browse businesses, see rating and efficiency rate, book a time, cancel, rate completed visits.
- **Business owners:** the Google email an admin assigns to a business. They confirm or decline bookings, mark visits done on time, late or no-show, and **edit their own listing**.
- **Admins:** emails in `ADMIN_EMAILS`. They add, edit and delete businesses, assign owners by Google email, and remove bookings or reviews.
- **Rating** = average of client reviews. **Efficiency rate** = resolved bookings completed on time (declines, late work and no-shows lower it).
- The database blocks double bookings, so two people can never hold the same slot.

## 1. Create a Google OAuth client

1. Open <https://console.cloud.google.com/apis/credentials> and pick or create a project.
2. Configure the **OAuth consent screen** (External is fine; add your own email as a test user while testing).
3. **Create credentials → OAuth client ID → Web application.**
4. Under **Authorized JavaScript origins** add `http://localhost:3000` and, for production, `https://your-domain.com`.
   You do not need a redirect URI.
5. Copy the **Client ID**.

## 2. Run it

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env     # then edit .env: GOOGLE_CLIENT_ID and ADMIN_EMAILS
npm start                # http://localhost:3000
```

Sign in with an email listed in `ADMIN_EMAILS` to see the **Admin** tab. Open it, edit a business, and type the owner's Google email.
When that person signs in with that email, a **Business** tab appears for them.

If `npm install` cannot download a prebuilt `better-sqlite3`, install build tools (`python3`, `make`, `g++`) and retry.

## 3. Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | Required. Web client ID from step 1. |
| `ADMIN_EMAILS` | Comma-separated admin Google emails. |
| `ALLOWED_DOMAIN` | Optional. Restrict sign-in to one Workspace domain. |
| `DB_FILE` | SQLite file path (default `./data/nearby.db`). |
| `TRUST_PROXY` | Set to `1` behind a reverse proxy. |
| `SEED_DEMO` | `0` skips the six demo businesses on first start. |
| `TZ` | Timezone for "today" and the 7 bookable days. |

## 4. Deploy

Google only allows sign-in on `https://` origins (except localhost), so put the app behind HTTPS.

**Docker**
```bash
docker build -t nearby .
docker run -d --name nearby -p 3000:3000 --env-file .env -v nearby-data:/data nearby
```

**Caddy** (automatic HTTPS), in your `Caddyfile`:
```
your-domain.com {
  reverse_proxy localhost:3000
}
```
Set `NODE_ENV=production` and `TRUST_PROXY=1` so cookies are marked `Secure`.

## 5. Security notes

- Google ID tokens are verified on the server (audience = your client ID, email must be verified). The page never decides who is admin or owner.
- Sessions are random 256-bit tokens in an `HttpOnly`, `SameSite=Lax` cookie. Only a hash of the token is stored.
- Every write needs a custom `X-Requested-With` header and a JSON body, which blocks cross-site request forgery.
- A strict Content-Security-Policy allows only your own scripts plus Google's sign-in script.
- Rate limits cover sign-in and booking creation. The limiter is in memory, so it resets on restart.
- Owners see client names only. Admins also see client emails.

## 6. Backups and upgrades

Everything lives in one SQLite file. Back it up while the app runs with:
```bash
sqlite3 data/nearby.db ".backup backup.db"
```
Tables: `users`, `sessions`, `businesses`, `bookings` (reviews are columns on bookings).

## 7. Tests

```bash
npm test
```
Covers stats maths, double-booking protection and cascading deletes.

## Known limits

- SQLite suits a single server and thousands of bookings. For several servers, move to Postgres.
- Opening hours are free text. Bookable times are fixed hourly slots (09:00 to 16:00) for the next 7 days, set in `server.js` (`SLOTS`).
- No email or SMS notifications yet.
