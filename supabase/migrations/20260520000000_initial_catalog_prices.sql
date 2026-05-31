create extension if not exists pgcrypto;

do $$ begin
  create type public.item_type as enum ('single_card', 'sealed_product');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.price_confidence as enum ('high', 'medium', 'low');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.card_sets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  name_ko text,
  release_date date,
  total_cards integer,
  description text,
  hero_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references public.card_sets(id) on delete set null,
  collector_number text,
  slug text not null unique,
  name text not null,
  name_ko text,
  champion text,
  rarity text,
  card_type text,
  image_url text,
  official_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sealed_products (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references public.card_sets(id) on delete set null,
  slug text not null unique,
  name text not null,
  name_ko text,
  product_type text not null,
  pack_count integer,
  cards_per_pack integer,
  msrp_usd numeric(12, 2),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  base_url text not null,
  currency text not null default 'USD',
  priority integer not null default 100,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.price_observations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.market_sources(id) on delete cascade,
  item_type public.item_type not null,
  card_id uuid references public.cards(id) on delete cascade,
  sealed_product_id uuid references public.sealed_products(id) on delete cascade,
  condition text,
  grade text,
  listing_type text,
  price_native numeric(14, 2) not null,
  currency text not null,
  price_krw integer not null,
  shipping_krw integer not null default 0,
  observed_url text,
  observed_title text,
  observed_at timestamptz not null default now(),
  confidence public.price_confidence not null default 'medium',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint price_observations_one_item check (
    (card_id is not null and sealed_product_id is null)
    or (card_id is null and sealed_product_id is not null)
  )
);

create table if not exists public.price_summaries (
  id uuid primary key default gen_random_uuid(),
  item_type public.item_type not null,
  card_id uuid references public.cards(id) on delete cascade,
  sealed_product_id uuid references public.sealed_products(id) on delete cascade,
  lowest_price_krw integer,
  recent_sold_price_krw integer,
  average_price_krw integer,
  raw_price_krw integer,
  graded_price_krw integer,
  change_24h_percent numeric(8, 2) not null default 0,
  source_count integer not null default 0,
  confidence public.price_confidence not null default 'medium',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint price_summaries_one_item check (
    (card_id is not null and sealed_product_id is null)
    or (card_id is null and sealed_product_id is not null)
  )
);

create unique index if not exists price_summaries_card_key
  on public.price_summaries(card_id)
  where card_id is not null;

create unique index if not exists price_summaries_sealed_product_key
  on public.price_summaries(sealed_product_id)
  where sealed_product_id is not null;

create index if not exists price_observations_card_observed_at_idx
  on public.price_observations(card_id, observed_at desc)
  where card_id is not null;

create index if not exists price_observations_sealed_observed_at_idx
  on public.price_observations(sealed_product_id, observed_at desc)
  where sealed_product_id is not null;

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null,
  scheduled_for timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  sources_checked integer not null default 0,
  items_checked integer not null default 0,
  observations_inserted integer not null default 0,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.card_sets enable row level security;
alter table public.cards enable row level security;
alter table public.sealed_products enable row level security;
alter table public.market_sources enable row level security;
alter table public.price_observations enable row level security;
alter table public.price_summaries enable row level security;
alter table public.automation_runs enable row level security;

drop policy if exists "Public read card sets" on public.card_sets;
create policy "Public read card sets" on public.card_sets for select using (true);

drop policy if exists "Public read cards" on public.cards;
create policy "Public read cards" on public.cards for select using (is_active = true);

drop policy if exists "Public read sealed products" on public.sealed_products;
create policy "Public read sealed products" on public.sealed_products for select using (is_active = true);

drop policy if exists "Public read market sources" on public.market_sources;
create policy "Public read market sources" on public.market_sources for select using (is_active = true);

drop policy if exists "Public read price summaries" on public.price_summaries;
create policy "Public read price summaries" on public.price_summaries for select using (true);

insert into public.market_sources (slug, name, base_url, currency, priority, notes)
values
  ('tcgplayer', 'TCGplayer', 'https://www.tcgplayer.com/categories/trading-and-collectible-card-games/riftbound-league-of-legends-trading-card-game', 'USD', 10, 'US marketplace. JS-heavy pages may require browser research.'),
  ('cardmarket', 'Cardmarket', 'https://www.cardmarket.com/en/Riftbound/Products', 'EUR', 20, 'EU marketplace. Good source for sealed and singles when listings are available.'),
  ('ebay', 'eBay', 'https://www.ebay.com/sch/i.html?_nkw=Riftbound', 'USD', 30, 'Noisy marketplace. Use sold/current filters and confidence notes.'),
  ('pricecharting', 'PriceCharting', 'https://www.pricecharting.com/search-products?q=Riftbound&type=prices', 'USD', 40, 'Useful baseline and historical pricing source.')
on conflict (slug) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  currency = excluded.currency,
  priority = excluded.priority,
  notes = excluded.notes;

insert into public.card_sets (code, name, name_ko, total_cards, description)
values
  ('ORG', 'Origins', '오리진즈', 245, 'First Riftbound set and launch baseline.'),
  ('SPF', 'Spiritforged', '스피릿포지드', null, 'Mock follow-up set for UI planning.'),
  ('UNL', 'Unleashed', '언리쉬드', null, 'Mock set for sealed product and card browsing.'),
  ('PRG', 'Proving Grounds', '프로빙 그라운드', null, 'Mock box set and beginner product line.'),
  ('PRM', 'Promo', '프로모', null, 'Promo and event card grouping.')
on conflict (code) do update set
  name = excluded.name,
  name_ko = excluded.name_ko,
  total_cards = excluded.total_cards,
  description = excluded.description;

with org as (
  select id from public.card_sets where code = 'ORG'
)
insert into public.cards (set_id, slug, name, name_ko, champion, rarity, card_type, image_url, official_url)
select org.id, item.slug, item.name, item.name_ko, item.champion, item.rarity, item.card_type, item.image_url, item.official_url
from org
cross join (
  values
    ('ahri-spirit-lure', 'Spirit Lure', '영혼의 유혹', 'Ahri', 'mythic', 'signature', null, 'https://riftbound.leagueoflegends.com/ko-kr/card-gallery/'),
    ('jinx-excited', 'Get Excited', '신난다!', 'Jinx', 'mythic', 'signature', null, 'https://riftbound.leagueoflegends.com/ko-kr/card-gallery/'),
    ('yasuo-unforgiven', 'The Unforgiven', '용서받지 못한 자', 'Yasuo', 'mythic', 'champion', null, 'https://riftbound.leagueoflegends.com/ko-kr/card-gallery/'),
    ('miss-fortune-bounty', 'Bounty Hunter', '현상금 사냥꾼', 'Miss Fortune', 'legendary', 'champion', null, 'https://riftbound.leagueoflegends.com/ko-kr/card-gallery/'),
    ('teemo-scout', 'Swift Scout', '날쌘 정찰병', 'Teemo', 'legendary', 'champion', null, 'https://riftbound.leagueoflegends.com/ko-kr/card-gallery/'),
    ('thresh-prison', 'Soul Prison', '영혼 감옥', 'Thresh', 'legendary', 'champion', null, 'https://riftbound.leagueoflegends.com/ko-kr/card-gallery/'),
    ('lux-light-mage', 'Light Mage', '빛의 마법사', 'Lux', 'epic', 'champion', null, 'https://riftbound.leagueoflegends.com/ko-kr/card-gallery/'),
    ('lee-sin-monk', 'Blind Monk', '눈먼 수도승', 'Lee Sin', 'epic', 'champion', null, 'https://riftbound.leagueoflegends.com/ko-kr/card-gallery/')
) as item(slug, name, name_ko, champion, rarity, card_type, image_url, official_url)
on conflict (slug) do update set
  name = excluded.name,
  name_ko = excluded.name_ko,
  champion = excluded.champion,
  rarity = excluded.rarity,
  card_type = excluded.card_type,
  image_url = excluded.image_url,
  official_url = excluded.official_url;

with org as (
  select id from public.card_sets where code = 'ORG'
)
insert into public.sealed_products (set_id, slug, name, name_ko, product_type, pack_count, cards_per_pack, msrp_usd)
select org.id, item.slug, item.name, item.name_ko, item.product_type, item.pack_count, item.cards_per_pack, item.msrp_usd
from org
cross join (
  values
    ('origins-booster-display', 'Origins Booster Display', '오리진즈 부스터 디스플레이', 'booster_display', 24, 12, 99.99),
    ('spiritforged-booster-display', 'Spiritforged Booster Display', '스피릿포지드 부스터 디스플레이', 'booster_display', 24, 12, 99.99),
    ('unleashed-booster-display', 'Unleashed Booster Display', '언리쉬드 부스터 디스플레이', 'booster_display', 24, 12, 99.99),
    ('proving-grounds-box-set', 'Proving Grounds Box Set', '프로빙 그라운드 박스 세트', 'box_set', 6, null, 49.99),
    ('booster-pack', 'Booster Pack', '부스터 팩', 'booster_pack', 1, 12, 4.49),
    ('starter-decks', 'Starter Decks', '스타터 덱', 'starter_deck', null, 60, 16.99)
) as item(slug, name, name_ko, product_type, pack_count, cards_per_pack, msrp_usd)
on conflict (slug) do update set
  name = excluded.name,
  name_ko = excluded.name_ko,
  product_type = excluded.product_type,
  pack_count = excluded.pack_count,
  cards_per_pack = excluded.cards_per_pack,
  msrp_usd = excluded.msrp_usd;

with seed(slug, lowest_price_krw, recent_sold_price_krw, average_price_krw, raw_price_krw, graded_price_krw, change_24h_percent, confidence) as (
  values
    ('ahri-spirit-lure', 138000, 142000, 140500, 142000, 1250000, 12.35, 'high'::public.price_confidence),
    ('jinx-excited', 94000, 98000, 96500, 98000, 850000, 8.21, 'high'::public.price_confidence),
    ('yasuo-unforgiven', 84000, 87000, 86000, 87000, 980000, -2.11, 'high'::public.price_confidence),
    ('miss-fortune-bounty', 59000, 61000, 60500, 61000, 420000, 5.73, 'high'::public.price_confidence),
    ('teemo-scout', 43000, 45000, 44200, 45000, 320000, 3.19, 'medium'::public.price_confidence),
    ('thresh-prison', 36000, 38000, 37200, 38000, 280000, -1.28, 'medium'::public.price_confidence),
    ('lux-light-mage', 21000, 22000, 21600, 22000, 150000, 1.85, 'medium'::public.price_confidence),
    ('lee-sin-monk', 17000, 18000, 17600, 18000, 110000, -0.67, 'low'::public.price_confidence)
)
insert into public.price_summaries (
  item_type,
  card_id,
  lowest_price_krw,
  recent_sold_price_krw,
  average_price_krw,
  raw_price_krw,
  graded_price_krw,
  change_24h_percent,
  source_count,
  confidence
)
select
  'single_card'::public.item_type,
  cards.id,
  seed.lowest_price_krw,
  seed.recent_sold_price_krw,
  seed.average_price_krw,
  seed.raw_price_krw,
  seed.graded_price_krw,
  seed.change_24h_percent,
  4,
  seed.confidence
from seed
join public.cards on cards.slug = seed.slug
on conflict (card_id) where card_id is not null do update set
  lowest_price_krw = excluded.lowest_price_krw,
  recent_sold_price_krw = excluded.recent_sold_price_krw,
  average_price_krw = excluded.average_price_krw,
  raw_price_krw = excluded.raw_price_krw,
  graded_price_krw = excluded.graded_price_krw,
  change_24h_percent = excluded.change_24h_percent,
  source_count = excluded.source_count,
  confidence = excluded.confidence,
  updated_at = now();

with seed(slug, lowest_price_krw, recent_sold_price_krw, average_price_krw, change_24h_percent, confidence) as (
  values
    ('origins-booster-display', 138000, 142000, 140800, 12.35, 'high'::public.price_confidence),
    ('spiritforged-booster-display', 114000, 118000, 116500, 9.42, 'medium'::public.price_confidence),
    ('unleashed-booster-display', 92000, 96000, 94800, 5.64, 'medium'::public.price_confidence),
    ('proving-grounds-box-set', 69000, 72000, 70800, 7.18, 'medium'::public.price_confidence),
    ('booster-pack', 4900, 5200, 5100, 4.98, 'medium'::public.price_confidence),
    ('starter-decks', 19800, 21000, 20500, -1.41, 'low'::public.price_confidence)
)
insert into public.price_summaries (
  item_type,
  sealed_product_id,
  lowest_price_krw,
  recent_sold_price_krw,
  average_price_krw,
  change_24h_percent,
  source_count,
  confidence
)
select
  'sealed_product'::public.item_type,
  sealed_products.id,
  seed.lowest_price_krw,
  seed.recent_sold_price_krw,
  seed.average_price_krw,
  seed.change_24h_percent,
  4,
  seed.confidence
from seed
join public.sealed_products on sealed_products.slug = seed.slug
on conflict (sealed_product_id) where sealed_product_id is not null do update set
  lowest_price_krw = excluded.lowest_price_krw,
  recent_sold_price_krw = excluded.recent_sold_price_krw,
  average_price_krw = excluded.average_price_krw,
  change_24h_percent = excluded.change_24h_percent,
  source_count = excluded.source_count,
  confidence = excluded.confidence,
  updated_at = now();
