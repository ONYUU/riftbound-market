with product_sets(slug, set_code) as (
  values
    ('origins-booster-display', 'ORG'),
    ('booster-pack', 'ORG'),
    ('starter-decks', 'ORG'),
    ('spiritforged-booster-display', 'SPF'),
    ('unleashed-booster-display', 'UNL'),
    ('proving-grounds-box-set', 'PRG')
)
update public.sealed_products
set
  set_id = card_sets.id,
  updated_at = now()
from product_sets
join public.card_sets on card_sets.code = product_sets.set_code
where public.sealed_products.slug = product_sets.slug;
