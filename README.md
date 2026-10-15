# Subletka

Subletka lists rooms and flats for stays of weeks or months in Warsaw and Kraków, in Polish and English. Anyone can browse and contact a lister without an account, and listers post and edit in the browser. The site is live at [subletka.com](https://subletka.com).

## Stack

- Next.js 16 (App Router), React 19, and TypeScript.
- Tailwind CSS v4 with shadcn/ui primitives.
- Postgres through Drizzle ORM. Migrations in `drizzle/` run when the server starts.
- MapLibre GL with OpenFreeMap vector tiles.
- A standalone Node build behind `deploy/boot.js`, which swaps releases blue/green.

## Run it locally with synthetic data

You need Node 22 and Docker.

1. Start Postgres:

   ```sh
   docker compose up -d
   ```

2. Copy the example environment. Every value in it is optional for local work.

   ```sh
   cp .env.example .env.local
   ```

3. Install dependencies and seed the database:

   ```sh
   npm install
   npm run seed
   ```

   The seed writes 36 invented listings in Warsaw and Kraków with generated photos. It refuses to write to a database that is not on localhost.

4. Start the dev server and open <http://localhost:3000>:

   ```sh
   npm run dev
   ```

To check your changes, run `npm run typecheck`, `npm run lint`, and `npm test`. Database tests skip when `DATABASE_URL` is unset.

## Configuration

The app reads these variables. `.env.example` lists them all.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. |
| `SITE_URL` | Public origin for canonical links and the sitemap. |
| `AUTH_SECRET` | Signs sessions and derives public listing ids. Required in production. |
| `INGEST_TOKEN` | Bearer token for `POST /api/ingest`. |
| `DEPLOY_TOKEN` | Bearer token for `/__deploy`, `/__rollback`, and `/api/admin/*`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in. Sign-in is hidden when they are unset. |
| `INDEXNOW_KEY` | IndexNow pings after each import. |
| `SUPPORT_FORWARD_TO`, `SUPPORT_DKIM_PRIVATE_KEY` | Delivery of the contact form. |
| `FORBIDDEN_SOURCES`, `FORBIDDEN_SOURCE_HOSTS`, `FORBIDDEN_IDENTITY` | Comma-separated terms that never appear in site copy. Imported text that names a source is scrubbed. A leading `=` makes a term case-sensitive. |
| `FORBIDDEN_TERMS_FILE` | File with the same `KEY=value` lines, read for any `FORBIDDEN_*` variable that is unset. Defaults to `~/.subletka/forbidden-terms`. |

When neither the variables nor the file are present, the app uses synthetic placeholder terms. Unit tests always use the placeholders.

## Deploy

`deploy/ship.sh` builds the app, uploads the tarball to `PUT $DEPLOY_URL/__deploy`, and prints the release that `/__boot` reports:

```sh
DEPLOY_URL=https://your-host DEPLOY_TOKEN=... deploy/ship.sh
```

`deploy/boot.js` runs on the host. It starts each release on a free port, waits until `/pl` returns 200, switches traffic, and drains the old release. It keeps releases in an S3-compatible bucket configured by `RELEASE_BUCKET`, `RELEASE_BUCKET_ENDPOINT`, `RELEASE_BUCKET_REGION`, `RELEASE_BUCKET_ACCESS_KEY_ID`, and `RELEASE_BUCKET_SECRET_ACCESS_KEY`.

## Data and credits

- Map tiles come from OpenFreeMap, built on OpenMapTiles. Map data © OpenStreetMap contributors.
- The files in `src/data` are derived from OpenStreetMap and are available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- Minutes to the centre are computed from the public GTFS timetables of ZTM Warszawa (as published at mkuran.pl) and ZTP Kraków.
- The Archivo font subset in `src/app/fonts` is licensed under the SIL Open Font License 1.1. See `src/app/fonts/OFL.txt`.

All rights reserved. No open-source license is granted.
