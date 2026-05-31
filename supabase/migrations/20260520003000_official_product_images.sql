with product_images(slug, image_url) as (
  values
    ('origins-booster-display', 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/consumer_products_live/e026ee1a44bc86095f9afc5949c5fdb519b29c66-2560x2560.png?accountingTag=RB'),
    ('spiritforged-booster-display', 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/consumer_products_live/22aabf7f3ab0081cf42f6b4ebc4af4c5c92437f9-2560x2560.png?accountingTag=RB'),
    ('unleashed-booster-display', 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/consumer_products_live/46c776a96cc14227a260d24489f10b4090cd2cd9-2560x2560.png?accountingTag=RB'),
    ('proving-grounds-box-set', 'https://cmsassets.rgpub.io/sanity/images/dsfx7636/consumer_products_live/a2ca8f9bc247fc5435432e9a97c4efc5b79020c4-2560x2560.png?accountingTag=RB')
)
update public.sealed_products
set
  image_url = product_images.image_url,
  updated_at = now()
from product_images
where public.sealed_products.slug = product_images.slug;
