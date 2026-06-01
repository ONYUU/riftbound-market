# Supabase Database Design

## Tables

### `card_sets`

Stores Riftbound sets.

Important columns:

- `id`
- `code`
- `name`
- `name_ko`
- `release_date`
- `total_cards`
- `description`
- `hero_image_url`

### `cards`

Stores single card catalog data.

Important columns:

- `id`
- `set_id`
- `collector_number`
- `slug`
- `name`
- `name_ko`
- `champion`
- `rarity`
- `card_type`
- `image_url`
- `official_url`
- `is_active`

### `sealed_products`

Stores unopened product catalog data.

Important columns:

- `id`
- `set_id`
- `slug`
- `name`
- `name_ko`
- `product_type`
- `pack_count`
- `cards_per_pack`
- `msrp_usd`
- `image_url`
- `is_active`

### `market_sources`

Stores price source configuration.

Important columns:

- `id`
- `slug`
- `name`
- `base_url`
- `currency`
- `priority`
- `is_active`
- `notes`

### `price_observations`

Stores every researched price observation.

Important columns:

- `id`
- `source_id`
- `item_type`
- `card_id`
- `sealed_product_id`
- `condition`
- `grade`
- `listing_type`
- `price_native`
- `currency`
- `price_krw`
- `shipping_krw`
- `observed_url`
- `observed_title`
- `observed_at`
- `confidence`
- `notes`

Constraints:

- exactly one of `card_id` or `sealed_product_id` must be present.
- `item_type` must be `single_card` or `sealed_product`.

### `price_summaries`

Stores current item-level price summary shown by the website.

Important columns:

- `id`
- `item_type`
- `card_id`
- `sealed_product_id`
- `lowest_price_krw`
- `recent_sold_price_krw`
- `average_price_krw`
- `raw_price_krw`
- `graded_price_krw`
- `change_24h_percent`
- `source_count`
- `confidence`
- `updated_at`

### `automation_runs`

Stores every Codex automation run.

Important columns:

- `id`
- `run_type`
- `scheduled_for`
- `started_at`
- `finished_at`
- `status`
- `sources_checked`
- `items_checked`
- `observations_inserted`
- `message`
- `metadata`

## RLS Strategy

Public read:

- `card_sets`
- `cards`
- `sealed_products`
- `market_sources`
- `price_summaries`

Server-only write:

- `price_observations`
- `price_summaries`
- `automation_runs`

The website reads public catalog and summary data through the publishable key. Automation writes through server-side Supabase credentials only.

Current frontend policy:

- Users browse and interact as guests without OAuth login.
- Guest community writes are local UI interactions unless a moderated server-side write path is added.
- Do not open anonymous direct inserts to public community tables without spam protection, moderation, and rate limiting.

## Initial Seed Scope

Use sample catalog rows first:

- 5 sets
- 8 single cards
- 6 sealed products
- 4 market sources
- 14 price summaries

Official image URLs can be filled after the card gallery extraction is confirmed.
