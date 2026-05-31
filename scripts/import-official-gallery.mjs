import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const OFFICIAL_GALLERY_URL = "https://riftbound.leagueoflegends.com/ko-kr/card-gallery/";

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

function extractNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("__NEXT_DATA__ block not found on official gallery page.");
  return JSON.parse(match[1]);
}

function toInteger(value) {
  const next = Number(value?.id ?? value?.label ?? value);
  return Number.isFinite(next) ? next : null;
}

function inferChampion(card) {
  const superTypes = card.cardType?.superType || [];
  if (superTypes.some((type) => type.id === "champion")) {
    return String(card.name || "").split(",")[0].trim() || card.name;
  }

  const tags = card.tags?.tags || [];
  const championLike = tags.find((tag) => /^[A-Z][A-Za-z'. -]+$/.test(tag) && !["Ionia", "Noxus", "Piltover", "Demacia", "Runeterra"].includes(tag));
  return championLike || tags[0] || "General";
}

function mapCard(card, setIdByCode) {
  const typeLabels = [...(card.cardType?.superType || []), ...(card.cardType?.type || [])].map((type) => type.label);
  const domains = card.domain?.values?.map((domain) => domain.label) || [];
  const tags = card.tags?.tags || [];

  return {
    set_id: setIdByCode.get(card.set?.value?.id) || null,
    official_id: card.id,
    public_code: card.publicCode || null,
    collector_number: card.publicCode || String(card.collectorNumber || ""),
    slug: card.id,
    name: card.name,
    name_ko: card.name,
    champion: inferChampion(card),
    rarity: card.rarity?.value?.label || card.rarity?.value?.id || "Unknown",
    card_type: typeLabels.join(" / ") || "Card",
    domain: domains.join(" / ") || null,
    energy: toInteger(card.energy?.value),
    might: toInteger(card.might?.value),
    power: toInteger(card.power?.value),
    orientation: card.orientation === "landscape" ? "landscape" : "portrait",
    tags,
    image_url: card.cardImage?.url || null,
    official_url: OFFICIAL_GALLERY_URL,
    source_payload: {
      collectorNumber: card.collectorNumber,
      set: card.set?.value,
      rarity: card.rarity?.value,
      cardType: {
        superType: card.cardType?.superType?.map((type) => ({ id: type.id, label: type.label })) || [],
        type: card.cardType?.type?.map((type) => ({ id: type.id, label: type.label })) || [],
      },
      domain: card.domain?.values?.map((domain) => ({ id: domain.id, label: domain.label })) || [],
      text: card.text?.richText?.body || null,
      artist: card.illustrator?.values?.map((artist) => artist.label) || [],
    },
    is_active: true,
    updated_at: new Date().toISOString(),
  };
}

async function upsertInChunks(supabase, table, rows, chunkSize = 200) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: table === "cards" ? "slug" : "code" });
    if (error) throw error;
  }
}

async function main() {
  loadDotEnvLocal();

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

  const html = await (await fetch(OFFICIAL_GALLERY_URL)).text();
  const data = extractNextData(html);
  const gallery = data.props.pageProps.page.blades.find((blade) => blade.type === "riftboundCardGallery");
  if (!gallery) throw new Error("riftboundCardGallery blade not found.");

  const setRows = gallery.sets.items.map((set) => ({
    code: set.id,
    name: set.name,
    name_ko: set.name,
    total_cards: set.collectorNumberMax || null,
    description: "Imported from the official Riftbound card gallery.",
    updated_at: new Date().toISOString(),
  }));

  await upsertInChunks(supabase, "card_sets", setRows, 100);

  const { data: dbSets, error: setsError } = await supabase.from("card_sets").select("id, code");
  if (setsError) throw setsError;
  const setIdByCode = new Map(dbSets.map((set) => [set.code, set.id]));

  const cardRows = gallery.cards.items.map((card) => mapCard(card, setIdByCode));
  await upsertInChunks(supabase, "cards", cardRows, 200);

  const { error: deactivateError } = await supabase.from("cards").update({ is_active: false }).is("official_id", null);
  if (deactivateError) throw deactivateError;

  console.log(`Imported ${cardRows.length} official cards across ${setRows.length} sets.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
