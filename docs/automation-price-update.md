# Codex Price Update Automation

## Schedule

Run three times daily in Korea time:

- 09:00 KST
- 15:00 KST
- 20:00 KST

## Research Scope

Sources:

- TCGplayer
- Cardmarket
- eBay
- PriceCharting

Item groups:

- `single_card`
- `sealed_product`

Metrics:

- lowest credible listing price
- recent sold price where available
- average credible price

## Research Rules

- Record source URL for every observation.
- Record native currency, USD price, KRW price, and the exchange rate used for the run.
- Use `confidence=low` for noisy listings, mixed lots, unrelated accessories, or unclear conditions.
- For eBay, prefer sold listings for `recent_sold` and ignore obvious unrelated items.
- Do not overwrite catalog rows unless the official card gallery changed.
- Active single-card slugs now use official gallery IDs, for example `ogn-066a-298`.
- If a source blocks access or has no credible result, skip that source and write a note in `automation_runs`.

## Automation Output

Codex should create a JSON file matching:

```json
{
  "runType": "scheduled_price_research",
  "scheduledFor": "2026-05-20T09:00:00+09:00",
  "message": "Completed scheduled price research.",
  "exchangeRateKrwPerUsd": 1350,
  "observations": [
    {
      "itemType": "single_card",
      "itemSlug": "ogn-066a-298",
      "sourceSlug": "pricecharting",
      "listingType": "recent_sold",
      "condition": "raw",
      "grade": null,
      "priceNative": 102.5,
      "currency": "USD",
      "priceUsd": 102.5,
      "priceKrw": 140500,
      "exchangeRateKrwPerUsd": 1370.73,
      "shippingKrw": 0,
      "observedUrl": "https://example.com/source",
      "observedTitle": "Ahri, Alluring Riftbound",
      "observedAt": "2026-05-20T09:00:00+09:00",
      "confidence": "medium",
      "notes": "Representative recent sold result."
    }
  ]
}
```

Then run:

```bash
npm run prices:upsert -- scripts/price-research-template.json
```

The script updates:

- `price_observations`
- `price_summaries` in both KRW and USD fields
- `automation_runs`

## Official Card Gallery Refresh

When the official gallery changes, run:

```bash
npm run cards:import-official
```

This imports official card names, set codes, collector numbers, rarity, type, tags, orientation, and image URLs from:

```text
https://riftbound.leagueoflegends.com/ko-kr/card-gallery/
```

## Required Local Environment

The script requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`

Keep these in `.env.local`, which is ignored by Git.
