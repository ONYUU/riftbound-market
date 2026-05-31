import { NextResponse } from "next/server";
import { mockCatalog } from "@/data/riftbound-data";
import type { CardItem, CatalogPayload, MarketSource, PriceSourceLink, SealedProduct } from "@/lib/riftbound-types";
import { getSupabaseReadClient, isSupabaseReadConfigured } from "@/lib/supabase-server";

type SummaryRow = {
  item_type: "single_card" | "sealed_product";
  card_id: string | null;
  sealed_product_id: string | null;
  lowest_price_krw: number | null;
  recent_sold_price_krw: number | null;
  average_price_krw: number | null;
  raw_price_krw: number | null;
  graded_price_krw: number | null;
  lowest_price_usd: number | null;
  recent_sold_price_usd: number | null;
  average_price_usd: number | null;
  raw_price_usd: number | null;
  graded_price_usd: number | null;
  exchange_rate_krw_per_usd: number | null;
  change_24h_percent: number | null;
  confidence: "high" | "medium" | "low";
  updated_at: string;
};

type SourceRow = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  currency: string;
  priority: number;
};

type ObservationRow = {
  source_id: string;
  item_type: "single_card" | "sealed_product";
  card_id: string | null;
  sealed_product_id: string | null;
  listing_type: string | null;
  price_krw: number | null;
  price_usd: number | null;
  currency: string | null;
  observed_url: string | null;
  observed_title: string | null;
  observed_at: string | null;
  price_native: number | null;
};

const FALLBACK_EXCHANGE_RATE = 1350;

function toUsd(value: number | null | undefined, summary: SummaryRow | undefined, fallback?: number | null) {
  if (fallback !== undefined && fallback !== null) return Number(fallback);
  if (value === undefined || value === null) return null;
  const rate = Number(summary?.exchange_rate_krw_per_usd || FALLBACK_EXCHANGE_RATE);
  return Math.round((value / rate) * 100) / 100;
}

function readSetName(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0] as { name?: string } | undefined;
    return first?.name || "Unknown";
  }

  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name?: string }).name || "Unknown");
  }

  return "Unknown";
}

export async function GET() {
  if (!isSupabaseReadConfigured()) {
    return NextResponse.json(mockCatalog);
  }

  const supabase = getSupabaseReadClient();

  const [cardsResult, productsResult, sourcesResult, summariesResult, observationsResult] = await Promise.all([
    supabase
      .from("cards")
      .select(
        "id, slug, official_id, public_code, name, name_ko, champion, rarity, card_type, domain, energy, might, power, orientation, tags, image_url, official_url, card_sets(name)",
      )
      .eq("is_active", true)
      .order("set_id")
      .order("collector_number"),
    supabase.from("sealed_products").select("id, slug, name, name_ko, product_type, pack_count, cards_per_pack, msrp_usd, image_url, card_sets(name)").eq("is_active", true),
    supabase.from("market_sources").select("id, slug, name, base_url, currency, priority").eq("is_active", true).order("priority"),
    supabase.from("price_summaries").select("*"),
    supabase
      .from("price_observations")
      .select("source_id, item_type, card_id, sealed_product_id, listing_type, price_native, price_krw, price_usd, currency, observed_url, observed_title, observed_at")
      .order("observed_at", { ascending: false })
      .limit(1500),
  ]);

  if (cardsResult.error || productsResult.error || sourcesResult.error || summariesResult.error) {
    return NextResponse.json(mockCatalog);
  }

  const summaries = (summariesResult.data || []) as SummaryRow[];
  const summaryByCard = new Map(summaries.filter((row) => row.card_id).map((row) => [row.card_id, row]));
  const summaryByProduct = new Map(summaries.filter((row) => row.sealed_product_id).map((row) => [row.sealed_product_id, row]));
  const sourceRows = (sourcesResult.data || []) as unknown as SourceRow[];
  const sourceById = new Map(sourceRows.map((source) => [source.id, source]));
  const observations = (observationsResult.error ? [] : observationsResult.data || []) as ObservationRow[];
  const linksByCard = new Map<string, PriceSourceLink[]>();
  const linksByProduct = new Map<string, PriceSourceLink[]>();

  observations.forEach((observation) => {
    if (!observation.observed_url) return;
    const source = sourceById.get(observation.source_id);
    const link: PriceSourceLink = {
      sourceSlug: source?.slug || "source",
      sourceName: source?.name || "가격 소스",
      listingType: observation.listing_type,
      observedUrl: observation.observed_url,
      observedTitle: observation.observed_title,
      observedAt: observation.observed_at,
      priceNative: observation.price_native,
      priceKrw: observation.price_krw,
      priceUsd: observation.price_usd,
      currency: observation.currency,
    };
    const targetMap = observation.item_type === "sealed_product" ? linksByProduct : linksByCard;
    const key = observation.item_type === "sealed_product" ? observation.sealed_product_id : observation.card_id;
    if (!key) return;
    const current = targetMap.get(key) || [];
    if (current.some((item) => item.observedUrl === link.observedUrl)) return;
    if (current.length < 6) targetMap.set(key, [...current, link]);
  });

  const cards: CardItem[] = (cardsResult.data || []).map((row, index) => {
    const summary = summaryByCard.get(row.id);
    const fallback = mockCatalog.cards[index % mockCatalog.cards.length];
    const rawPriceKrw = summary?.raw_price_krw || summary?.average_price_krw || null;
    const lowestPriceKrw = summary?.lowest_price_krw || null;
    const recentSoldPriceKrw = summary?.recent_sold_price_krw || null;
    const averagePriceKrw = summary?.average_price_krw || null;
    const gradedPriceKrw = summary?.graded_price_krw || null;

    return {
      id: row.id,
      slug: row.slug,
      officialId: row.official_id,
      publicCode: row.public_code,
      name: row.name,
      nameKo: row.name_ko || row.name,
      champion: row.champion || row.name,
      set: readSetName(row.card_sets),
      rarity: row.rarity || "Unknown",
      cardType: row.card_type || "Card",
      domain: row.domain,
      energy: row.energy,
      might: row.might,
      power: row.power,
      orientation: row.orientation === "landscape" ? "landscape" : "portrait",
      tags: row.tags || [],
      imageUrl: row.image_url,
      officialUrl: row.official_url || "https://riftbound.leagueoflegends.com/ko-kr/card-gallery/",
      hasPrice: Boolean(summary?.average_price_krw || summary?.lowest_price_krw || summary?.recent_sold_price_krw || summary?.average_price_usd),
      rawPriceKrw,
      gradedPriceKrw,
      lowestPriceKrw,
      recentSoldPriceKrw,
      averagePriceKrw,
      rawPriceUsd: toUsd(rawPriceKrw, summary, summary?.raw_price_usd),
      gradedPriceUsd: toUsd(gradedPriceKrw, summary, summary?.graded_price_usd),
      lowestPriceUsd: toUsd(lowestPriceKrw, summary, summary?.lowest_price_usd),
      recentSoldPriceUsd: toUsd(recentSoldPriceKrw, summary, summary?.recent_sold_price_usd),
      averagePriceUsd: toUsd(averagePriceKrw, summary, summary?.average_price_usd),
      change24hPercent: Number(summary?.change_24h_percent || fallback.change24hPercent),
      confidence: summary?.confidence || fallback.confidence,
      priceLinks: linksByCard.get(row.id) || [],
      accent: fallback.accent,
    };
  });

  const sealedProducts: SealedProduct[] = (productsResult.data || []).map((row, index) => {
    const summary = summaryByProduct.get(row.id);
    const fallback = mockCatalog.sealedProducts[index % mockCatalog.sealedProducts.length];
    const lowestPriceKrw = summary?.lowest_price_krw || null;
    const recentSoldPriceKrw = summary?.recent_sold_price_krw || null;
    const averagePriceKrw = summary?.average_price_krw || null;

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      nameKo: row.name_ko || row.name,
      set: readSetName(row.card_sets),
      productType: row.product_type,
      packCount: row.pack_count,
      cardsPerPack: row.cards_per_pack,
      msrpUsd: row.msrp_usd,
      imageUrl: row.image_url,
      hasPrice: Boolean(summary?.average_price_krw || summary?.lowest_price_krw || summary?.recent_sold_price_krw || summary?.average_price_usd),
      lowestPriceKrw,
      recentSoldPriceKrw,
      averagePriceKrw,
      lowestPriceUsd: toUsd(lowestPriceKrw, summary, summary?.lowest_price_usd),
      recentSoldPriceUsd: toUsd(recentSoldPriceKrw, summary, summary?.recent_sold_price_usd),
      averagePriceUsd: toUsd(averagePriceKrw, summary, summary?.average_price_usd),
      change24hPercent: Number(summary?.change_24h_percent || fallback.change24hPercent),
      confidence: summary?.confidence || fallback.confidence,
      priceLinks: linksByProduct.get(row.id) || [],
    };
  });

  const latestUpdate = summaries
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  const marketSources: MarketSource[] = sourceRows.map((source) => ({
    slug: source.slug,
    name: source.name,
    baseUrl: source.base_url,
    currency: source.currency,
    priority: source.priority,
  }));

  const payload: CatalogPayload = {
    mode: "supabase",
    cards,
    sealedProducts,
    marketSources: marketSources.length ? marketSources : mockCatalog.marketSources,
    updatedAt: latestUpdate || new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
