# Riftbound TCG Web Product And Data Plan

## Goal Through Phase 5

Build a reviewable web-first Riftbound TCG market hub, then connect it to Supabase and prepare Codex automation for scheduled price research.

Phases:

1. Document product scope and database design.
2. Separate UI, types, and mock data so live data can replace mocks cleanly.
3. Improve the homepage and primary pages for visual review in the browser.
4. Apply the Supabase schema and verify read/write connectivity.
5. Prepare Codex automation for price updates at 09:00, 15:00, and 20:00 KST.

Current live catalog status:

- Official Riftbound gallery import is available through `npm run cards:import-official`.
- Active card catalog uses official gallery IDs as slugs.
- The first import loaded 958 official cards across 5 sets.
- Card images are loaded from Riot/Riftbound official `cmsassets.rgpub.io` URLs.
- Price summaries support KRW and USD display fields.

## Product Surfaces

- Home: market overview, top cards, sealed product highlights, price trend, notices.
- Cards: single card search, filters, top cards, signature cards, card table.
- Sets: set detail, set cards, sealed products, set trend.
- Market: sealed product prices, market insight, product comparison.
- Champions: champion cards, champion ranking.
- Calculator: resale ROI calculator for sealed products and cards.
- Collection: personal collection summary and watch list UI.
- Community: posts, topics, comments, community metrics.
- Guides: beginner guide, market guide, resale guide, rule summary.

## Item Types

### Single Card

A card sold as one individual card.

Examples:

- Ahri signature card
- Jinx raw card
- Yasuo PSA 10 card

Tracked prices:

- lowest price
- recent sold price
- average price
- raw price
- graded price such as PSA 10, BGS 10, CGC 10

### Sealed Product

An unopened product.

Examples:

- booster pack
- booster display
- booster box
- starter deck
- box set

Tracked prices:

- lowest price
- recent sold price
- average price
- official MSRP when available
- pack count and product composition

## Price Sources

Initial sources:

- TCGplayer: https://www.tcgplayer.com/categories/trading-and-collectible-card-games/riftbound-league-of-legends-trading-card-game
- Cardmarket: https://www.cardmarket.com/en/Riftbound/Products
- eBay: https://www.ebay.com/sch/i.html?_nkw=Riftbound
- PriceCharting: https://www.pricecharting.com/search-products?q=Riftbound&type=prices

Source rules:

- Store one row per observed price per source and item.
- Keep the source URL and captured timestamp.
- Record currency before conversion.
- Convert to KRW using the exchange rate stored for that run.
- Mark noisy results with a lower confidence score.
- eBay requires stricter filtering because listings include mixed lots, accessories, shipping variance, and irrelevant search matches.

## Price Metrics

For each item and source:

- `lowest_price`: lowest credible current listing.
- `recent_sold_price`: most recent credible sold price where available.
- `average_price`: average of credible current/sold observations for that source.

For each item summary:

- `lowest_price_krw`: minimum across sources.
- `recent_sold_price_krw`: most recent source-specific sold observation.
- `average_price_krw`: weighted average across credible observations.
- `lowest_price_usd`: USD equivalent or USD-native source value.
- `recent_sold_price_usd`: latest sold USD equivalent.
- `average_price_usd`: average USD equivalent.
- `exchange_rate_krw_per_usd`: exchange rate used by the run.
- `source_count`: number of sources used.
- `confidence`: high, medium, low.
- `updated_at`: last successful update time.

## Automation Behavior

Codex automation runs three times daily:

- 09:00 KST
- 15:00 KST
- 20:00 KST

Run steps:

1. Read active cards and sealed products from Supabase.
2. Research prices from each configured source.
3. Normalize currency, item type, condition, and source.
4. Insert raw observations into `price_observations`.
5. Recompute `price_summaries`.
6. Record result in `automation_runs`.
7. Leave a clear run note when a source is blocked, noisy, or unavailable.

## Supabase Activation Notes

Supabase is intentionally connected after the schema is reviewed. Keep the project ref in local environment variables only:

```text
SUPABASE_PROJECT_REF=your-project-ref
```

Secrets must stay out of Git. `.env.example` only stores safe placeholders.
