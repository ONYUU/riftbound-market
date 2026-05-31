# TCG.LOL

Unofficial Korean Riftbound TCG price comparison, collection, community, and guide prototype.

This repository is an open-source web MVP for reviewing the product direction and implementation. It is not affiliated with, sponsored by, approved by, or operated by Riot Games, Inc.

## Features

- Riftbound card and sealed product catalog UI
- KRW / USD price display
- Card, set, champion, market, calculator, collection, community, and guide pages
- Supabase schema and RLS migrations for catalog, prices, auth profiles, posts, and comments
- Price research scripts for controlled manual or scheduled updates

## Tech Stack

- Next.js
- React
- TypeScript
- Supabase
- Tailwind CSS

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` for local development.

```bash
cp .env.example .env.local
```

Do not commit real values for:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_ACCESS_TOKEN`
- any database connection string

`NEXT_PUBLIC_*` values are browser-visible. They are not suitable for service-role or admin secrets.

## Data And IP Notice

Riftbound, League of Legends, and related names, marks, and imagery belong to their respective owners, including Riot Games, Inc.

Card images are loaded from official public Riftbound/Riot asset URLs where available. This project does not redistribute downloaded image files.

Price data is collected for reference only. Market prices can change quickly and may vary by condition, shipping, taxes, exchange rate, and marketplace availability. Generated price research snapshots are intentionally ignored from Git; keep only sample templates in the public repository.

## Supabase

Schema migrations live in `supabase/migrations`.

Local Supabase CLI state under `supabase/.temp` is ignored and should not be published.

## Scripts

```bash
npm run build
npm run lint
npm run cards:import-official
npm run prices:upsert -- scripts/price-research-template.json
```

The import and price update scripts require server-side Supabase credentials in `.env.local`.

## Contact

For project questions: beot.ai.team@gmail.com
