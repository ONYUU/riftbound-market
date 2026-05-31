import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;

  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function assertObservation(observation) {
  const required = ["itemType", "itemSlug", "sourceSlug", "listingType", "priceNative", "currency", "priceKrw", "observedUrl", "observedTitle"];
  for (const key of required) {
    if (observation[key] === undefined || observation[key] === null || observation[key] === "") {
      throw new Error(`Observation missing ${key}`);
    }
  }
  if (!["single_card", "sealed_product"].includes(observation.itemType)) {
    throw new Error(`Invalid itemType: ${observation.itemType}`);
  }
}

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function averageDecimal(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function observationUsd(observation) {
  if (Number.isFinite(Number(observation.priceUsd))) return Number(observation.priceUsd);
  if (observation.currency === "USD") return Number(observation.priceNative);
  const rate = Number(observation.exchangeRateKrwPerUsd || 1350);
  return Math.round((Number(observation.priceKrw) / rate) * 100) / 100;
}

function latestSoldOrLatest(observations) {
  const sorted = [...observations].sort((a, b) => new Date(b.observedAt || 0).getTime() - new Date(a.observedAt || 0).getTime());
  return sorted.find((item) => item.listingType === "recent_sold") || sorted[0] || null;
}

async function main() {
  loadDotEnvLocal();

  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: npm run prices:upsert -- <path-to-price-research.json>");
  }

  const payload = JSON.parse(readFileSync(resolve(process.cwd(), inputPath), "utf8"));
  const observations = payload.observations || [];
  observations.forEach(assertObservation);

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv("SUPABASE_SECRET_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const runStart = new Date().toISOString();
  const { data: run, error: runError } = await supabase
    .from("automation_runs")
    .insert({
      run_type: payload.runType || "manual_price_research",
      scheduled_for: payload.scheduledFor || null,
      started_at: runStart,
      status: "running",
      message: payload.message || null,
      metadata: { inputPath },
    })
    .select("id")
    .single();

  if (runError) throw runError;

  const [{ data: cards, error: cardsError }, { data: products, error: productsError }, { data: sources, error: sourcesError }] = await Promise.all([
    supabase.from("cards").select("id, slug"),
    supabase.from("sealed_products").select("id, slug"),
    supabase.from("market_sources").select("id, slug"),
  ]);

  if (cardsError) throw cardsError;
  if (productsError) throw productsError;
  if (sourcesError) throw sourcesError;

  const cardBySlug = new Map(cards.map((card) => [card.slug, card]));
  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  const sourceBySlug = new Map(sources.map((source) => [source.slug, source]));

  const rows = observations.map((observation) => {
    const source = sourceBySlug.get(observation.sourceSlug);
    if (!source) throw new Error(`Unknown sourceSlug: ${observation.sourceSlug}`);

    const card = observation.itemType === "single_card" ? cardBySlug.get(observation.itemSlug) : null;
    const product = observation.itemType === "sealed_product" ? productBySlug.get(observation.itemSlug) : null;
    if (observation.itemType === "single_card" && !card) throw new Error(`Unknown card slug: ${observation.itemSlug}`);
    if (observation.itemType === "sealed_product" && !product) throw new Error(`Unknown sealed product slug: ${observation.itemSlug}`);

    return {
      source_id: source.id,
      item_type: observation.itemType,
      card_id: card?.id || null,
      sealed_product_id: product?.id || null,
      condition: observation.condition || null,
      grade: observation.grade || null,
      listing_type: observation.listingType,
      price_native: observation.priceNative,
      currency: observation.currency,
      price_krw: observation.priceKrw,
      price_usd: observationUsd(observation),
      exchange_rate_krw_per_usd: observation.exchangeRateKrwPerUsd || 1350,
      shipping_krw: observation.shippingKrw || 0,
      observed_url: observation.observedUrl,
      observed_title: observation.observedTitle,
      observed_at: observation.observedAt || new Date().toISOString(),
      confidence: observation.confidence || "medium",
      notes: observation.notes || null,
      metadata: observation.metadata || {},
    };
  });

  const { error: insertError } = await supabase.from("price_observations").insert(rows);
  if (insertError) throw insertError;

  const grouped = new Map();
  for (const observation of observations) {
    const key = `${observation.itemType}:${observation.itemSlug}`;
    const current = grouped.get(key) || [];
    current.push(observation);
    grouped.set(key, current);
  }

  for (const [key, group] of grouped.entries()) {
    const [itemType, slug] = key.split(":");
    const values = group.map((item) => Number(item.priceKrw)).filter((value) => Number.isFinite(value));
    const usdValues = group.map(observationUsd).filter((value) => Number.isFinite(value));
    const latest = latestSoldOrLatest(group);
    const exchangeRate = Number(latest?.exchangeRateKrwPerUsd || payload.exchangeRateKrwPerUsd || 1350);
    const summary = {
      item_type: itemType,
      lowest_price_krw: Math.min(...values),
      recent_sold_price_krw: latest?.priceKrw || null,
      average_price_krw: average(values),
      lowest_price_usd: usdValues.length ? Math.min(...usdValues) : null,
      recent_sold_price_usd: latest ? observationUsd(latest) : null,
      average_price_usd: averageDecimal(usdValues),
      exchange_rate_krw_per_usd: exchangeRate,
      change_24h_percent: 0,
      source_count: new Set(group.map((item) => item.sourceSlug)).size,
      confidence: group.some((item) => item.confidence === "high") ? "high" : group.some((item) => item.confidence === "medium") ? "medium" : "low",
      updated_at: new Date().toISOString(),
    };

    if (itemType === "single_card") {
      const card = cardBySlug.get(slug);
      const { data: existing, error: existingError } = await supabase.from("price_summaries").select("id").eq("card_id", card.id).maybeSingle();
      if (existingError) throw existingError;
      const row = {
        ...summary,
        card_id: card.id,
        sealed_product_id: null,
        raw_price_krw: summary.average_price_krw,
        raw_price_usd: summary.average_price_usd,
        graded_price_krw: null,
        graded_price_usd: null,
      };
      const query = existing ? supabase.from("price_summaries").update(row).eq("id", existing.id) : supabase.from("price_summaries").insert(row);
      const { error } = await query;
      if (error) throw error;
    } else {
      const product = productBySlug.get(slug);
      const { data: existing, error: existingError } = await supabase.from("price_summaries").select("id").eq("sealed_product_id", product.id).maybeSingle();
      if (existingError) throw existingError;
      const row = {
        ...summary,
        card_id: null,
        sealed_product_id: product.id,
        raw_price_krw: null,
        raw_price_usd: null,
        graded_price_krw: null,
        graded_price_usd: null,
      };
      const query = existing ? supabase.from("price_summaries").update(row).eq("id", existing.id) : supabase.from("price_summaries").insert(row);
      const { error } = await query;
      if (error) throw error;
    }
  }

  const { error: finishError } = await supabase
    .from("automation_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "success",
      sources_checked: new Set(observations.map((item) => item.sourceSlug)).size,
      items_checked: grouped.size,
      observations_inserted: rows.length,
    })
    .eq("id", run.id);

  if (finishError) throw finishError;
  console.log(`Inserted ${rows.length} observations and updated ${grouped.size} summaries.`);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
