# Nearby: local business booking on Netlify

Nearby lets visitors browse local businesses, signed-in clients request and review visits, business owners manage their listings and bookings, and administrators manage the directory.

The site uses a Vite frontend, Netlify Functions, Netlify Identity, and Netlify Database with Drizzle ORM. It runs independently of Claude. The previous exported HTML filename redirects to the homepage.

## Deployment

`netlify.toml` configures the build command, the `dist` publish directory, and `netlify/functions`. Netlify builds the frontend and applies the generated migrations in `netlify/database/migrations` during deployment. Database tables are defined in `db/schema.ts`; do not apply schema changes manually.

Netlify Identity is enabled by the marker in `.netlify/features/netlify-identity`. Email and password sign-in, signup confirmation, password recovery, and invitation acceptance are supported. Google sign-in appears only when the Google provider is enabled in the site's Identity settings.

## First-time setup

1. Deploy the project to Netlify.
2. In the project's **Identity** section, invite your administrator. After they accept the invitation, add the `admin` role to that account in the Netlify dashboard.
3. Sign in to Nearby and open **Admin** to add businesses. A fresh database starts with no listings; no sample businesses or accounts are created.
4. Business owners must register, confirm their email, and sign in at least once. An administrator can then search for their account by name or email when editing a business and assign ownership.

Roles are checked on the server, not taken from editable user metadata. Clients can cancel and review only their own visits. Owners can edit only their assigned listings and manage those listings' bookings. Only administrators can add or delete businesses, assign owners, or remove reviews and bookings.

## Local development

Requires Node.js 22.12 or newer and the Netlify CLI.

```bash
npm install
netlify dev --port 8889
```

Open `http://localhost:8889` to use the frontend and emulated function routes. The data API needs a provisioned Netlify Database with the deployed migrations. Before that deployment, the homepage still renders and displays a retry message rather than requiring Claude or leaving a blank page.

```bash
npm run check
npm run db:generate -- --name describe_schema_change
```

The first command checks TypeScript. The second generates migration files after a schema change; Netlify applies them automatically during deployment.

## Booking behavior

- Appointments use hourly slots from 09:00 to 16:00 UTC over the next seven days. Past slots are disabled; opening hours remain descriptive text.
- Active bookings have a database-enforced unique business/date/time constraint, preventing double bookings even with concurrent requests.
- Service prices are taken from the listing on the server and stored as integer cents, not trusted from the browser.
- Rating is the average of client reviews. Efficiency is the share of resolved bookings completed on time; declines, late visits, and no-shows lower it.
- Visitors can view availability and anonymized reviews without signing in. Customer identity and visit details are visible only to the client, the assigned owner, or an administrator. Only administrators can search account email addresses.
- Changes refresh after saving and periodically while browsing. Database or network failures show a retry action. There are no booking notification emails or SMS messages.
