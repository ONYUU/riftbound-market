alter table public.cards
  add column if not exists official_id text,
  add column if not exists public_code text,
  add column if not exists domain text,
  add column if not exists energy integer,
  add column if not exists might integer,
  add column if not exists power integer,
  add column if not exists orientation text not null default 'portrait',
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

create unique index if not exists cards_official_id_key
  on public.cards(official_id)
  where official_id is not null;

create index if not exists cards_filter_idx
  on public.cards(is_active, rarity, card_type, champion);

create index if not exists cards_set_collector_idx
  on public.cards(set_id, collector_number);

create index if not exists cards_tags_gin_idx
  on public.cards using gin(tags);

alter table public.price_observations
  add column if not exists price_usd numeric(14, 2),
  add column if not exists exchange_rate_krw_per_usd numeric(10, 2);

alter table public.price_summaries
  add column if not exists lowest_price_usd numeric(14, 2),
  add column if not exists recent_sold_price_usd numeric(14, 2),
  add column if not exists average_price_usd numeric(14, 2),
  add column if not exists raw_price_usd numeric(14, 2),
  add column if not exists graded_price_usd numeric(14, 2),
  add column if not exists exchange_rate_krw_per_usd numeric(10, 2) not null default 1350.00;

update public.price_summaries
set
  lowest_price_usd = coalesce(lowest_price_usd, round(lowest_price_krw::numeric / exchange_rate_krw_per_usd, 2)),
  recent_sold_price_usd = coalesce(recent_sold_price_usd, round(recent_sold_price_krw::numeric / exchange_rate_krw_per_usd, 2)),
  average_price_usd = coalesce(average_price_usd, round(average_price_krw::numeric / exchange_rate_krw_per_usd, 2)),
  raw_price_usd = coalesce(raw_price_usd, round(raw_price_krw::numeric / exchange_rate_krw_per_usd, 2)),
  graded_price_usd = coalesce(graded_price_usd, round(graded_price_krw::numeric / exchange_rate_krw_per_usd, 2))
where exchange_rate_krw_per_usd > 0;
