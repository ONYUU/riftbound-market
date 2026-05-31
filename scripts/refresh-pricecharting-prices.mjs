import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const priceChartingOrigin = "https://www.pricecharting.com";
const outputPath = "scripts/latest-price-research.json";
const fallbackExchangeRate = 1350;

const setPages = {
  "riftbound-origins": { set: "Origins", prefix: "OGN", total: "298" },
  "riftbound-spiritforged": { set: "Spiritforged", prefix: "SFD", total: "221" },
  "riftbound-unleashed": { set: "Unleashed", prefix: "UNL", total: "219" },
  "riftbound-origins-proving-grounds": { set: "Proving Grounds", prefix: "OGS", total: "024" },
};

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

function decodeHtml(value = "") {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function parseUsd(value = "") {
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchExchangeRate() {
  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=KRW");
    if (!response.ok) throw new Error(`Frankfurter ${response.status}`);
    const data = await response.json();
    const rate = Number(data?.rates?.KRW);
    if (Number.isFinite(rate) && rate > 0) return { rate, sourceDate: data?.date || null };
  } catch {
    // Fall through to the conservative fallback used by the app.
  }

  return { rate: fallbackExchangeRate, sourceDate: null };
}

async function fetchPriceChartingRows(consoleSlug) {
  let cursor = 0;
  const rows = [];

  while (true) {
    const url = `${priceChartingOrigin}/console/${consoleSlug}?sort=highest-price`;
    const options = cursor
      ? {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            sort: "highest-price",
            when: "none",
            "release-date": new Date().toISOString().slice(0, 10),
            cursor: String(cursor),
          }),
        }
      : {};
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`PriceCharting ${consoleSlug} ${response.status}`);
    const html = await response.text();

    rows.push(...Array.from(html.matchAll(/<tr id="product-[\s\S]*?<\/tr>/g), (match) => match[0]));

    const nextCursor = html.match(/name="cursor" value="(\d+)"/)?.[1];
    if (!nextCursor || Number(nextCursor) === cursor) break;
    cursor = Number(nextCursor);
  }

  return rows;
}

function formatCollectorPart(rawPart, tags) {
  if (/^T\d+/i.test(rawPart)) return rawPart.toUpperCase();

  const match = String(rawPart).match(/^(\d+)([A-Za-z]?)$/);
  if (!match) return rawPart.toUpperCase();

  const number = match[1].padStart(3, "0");
  let suffix = match[2].toLowerCase();
  if (tags.includes("signature")) suffix = "*";
  else if (tags.some((tag) => tag.includes("alternate art"))) suffix = "a";

  return `${number}${suffix}`;
}

function priceChartingCodeFor(title, meta) {
  const rawPart = title.match(/#([A-Za-z]*\d+[A-Za-z]?)/)?.[1];
  if (!rawPart) return null;

  const tags = Array.from(title.matchAll(/\[([^\]]+)\]/g), (match) => match[1].toLowerCase());
  if (tags.includes("foil") && !tags.includes("ultimate foil")) return null;

  const part = formatCollectorPart(rawPart, tags);
  if (part.startsWith("T")) return `${meta.prefix}-${part}`.toUpperCase();

  return `${meta.prefix}-${part}/${meta.total}`.toUpperCase();
}

function setName(row) {
  if (Array.isArray(row.card_sets)) return row.card_sets[0]?.name || "Unknown";
  return row.card_sets?.name || "Unknown";
}

function productKey(product) {
  return `${setName(product)}:${product.name.toLowerCase()}`;
}

function matchProduct(title, set, productByKey) {
  const lower = title.toLowerCase();
  if (lower === "booster display") return productByKey.get(`${set}:${set.toLowerCase()} booster display`) || null;
  if (set === "Origins" && lower === "proving grounds box set") return productByKey.get("Proving Grounds:proving grounds box set") || null;
  if (set === "Origins" && lower === "booster pack") return productByKey.get("Origins:booster pack") || null;
  if (set === "Origins" && (lower === "starter decks" || lower.startsWith("champion deck:"))) return productByKey.get("Origins:starter decks") || null;
  return null;
}

function parseRow(row) {
  const titleMatch = row.match(/<td class="title"[\s\S]*?<a href="([^"]+)">([\s\S]*?)<\/a>/);
  const priceMatch = Array.from(row.matchAll(/<span class="js-price">([^<]*)<\/span>/g))[0];
  if (!titleMatch || !priceMatch) return null;

  const title = decodeHtml(titleMatch[2]);
  const priceUsd = parseUsd(priceMatch[1]);
  if (!title || !priceUsd) return null;

  return {
    href: new URL(titleMatch[1], priceChartingOrigin).href,
    title,
    priceUsd,
  };
}

async function main() {
  loadDotEnvLocal();

  const { rate, sourceDate } = await fetchExchangeRate();
  const observedAt = new Date().toISOString();
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const [{ data: cards, error: cardError }, { data: products, error: productError }] = await Promise.all([
    supabase.from("cards").select("slug, public_code, card_sets(name)").eq("is_active", true).limit(2000),
    supabase.from("sealed_products").select("slug, name, card_sets(name)").eq("is_active", true),
  ]);

  if (cardError) throw cardError;
  if (productError) throw productError;

  const cardByCode = new Map((cards || []).filter((card) => card.public_code).map((card) => [String(card.public_code).toUpperCase(), card]));
  const productByKey = new Map((products || []).map((product) => [productKey(product), product]));
  const uniqueMatches = new Map();
  const parsedStats = {};
  const unmatched = [];
  let skippedFoilRows = 0;

  for (const [consoleSlug, meta] of Object.entries(setPages)) {
    const rows = await fetchPriceChartingRows(consoleSlug);
    parsedStats[meta.set] = { rows: rows.length, matched: 0 };

    for (const row of rows) {
      const parsed = parseRow(row);
      if (!parsed) continue;

      const code = priceChartingCodeFor(parsed.title, meta);
      let item = null;
      let itemType = "single_card";

      if (code) {
        item = cardByCode.get(code);
      } else if (/\[Foil\]/i.test(parsed.title) && !/\[Ultimate Foil\]/i.test(parsed.title)) {
        skippedFoilRows += 1;
      } else {
        item = matchProduct(parsed.title, meta.set, productByKey);
        itemType = "sealed_product";
      }

      if (!item) {
        unmatched.push({ set: meta.set, title: parsed.title, code, priceUsd: parsed.priceUsd });
        continue;
      }

      const key = `${itemType}:${item.slug}`;
      if (uniqueMatches.has(key)) continue;
      parsedStats[meta.set].matched += 1;

      uniqueMatches.set(key, {
        itemType,
        itemSlug: item.slug,
        sourceSlug: "pricecharting",
        listingType: "market_price",
        condition: "raw",
        grade: null,
        priceNative: parsed.priceUsd,
        currency: "USD",
        priceUsd: parsed.priceUsd,
        priceKrw: Math.round(parsed.priceUsd * rate),
        exchangeRateKrwPerUsd: rate,
        shippingKrw: 0,
        observedUrl: parsed.href,
        observedTitle: parsed.title,
        observedAt,
        confidence: "medium",
        notes: `PriceCharting ${meta.set} price guide. USD/KRW conversion${sourceDate ? ` uses Frankfurter rate dated ${sourceDate}` : " uses fallback rate"}.`,
      });
    }
  }

  const observations = Array.from(uniqueMatches.values()).sort((left, right) => Number(right.priceKrw) - Number(left.priceKrw));
  const payload = {
    runType: "manual_pricecharting_full_refresh",
    scheduledFor: observedAt,
    exchangeRateKrwPerUsd: rate,
    message: "Full current PriceCharting set-page refresh for Riftbound cards and sealed products. Plain foil rows are skipped because the local official DB does not model them as separate cards.",
    observations,
    metadata: {
      source: "https://www.pricecharting.com/search-products?q=Riftbound&type=prices",
      setPages: Object.keys(setPages).map((slug) => `${priceChartingOrigin}/console/${slug}?sort=highest-price`),
      exchangeRateSource: sourceDate ? `Frankfurter ${sourceDate}` : "fallback",
      parsedStats,
      skippedFoilRows,
      matchedObservations: observations.length,
      unmatchedCount: unmatched.length,
      unmatchedSample: unmatched.filter((item) => !item.title.includes("[Foil]")).slice(0, 40),
    },
  };

  writeFileSync(resolve(process.cwd(), outputPath), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${observations.length} observations to ${outputPath}`);
  console.log(JSON.stringify(payload.metadata, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
