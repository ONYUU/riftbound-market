export type TabId =
  | "home"
  | "cards"
  | "sets"
  | "market"
  | "champions"
  | "calculator"
  | "collection"
  | "community"
  | "guides";

export type ItemType = "single_card" | "sealed_product";
export type PriceConfidence = "high" | "medium" | "low";
export type CurrencyMode = "KRW" | "USD";

export type PriceSourceLink = {
  sourceSlug: string;
  sourceName: string;
  listingType: string | null;
  observedUrl: string;
  observedTitle: string | null;
  observedAt: string | null;
  priceNative?: number | null;
  priceKrw: number | null;
  priceUsd: number | null;
  currency: string | null;
};

export type CardItem = {
  id: string;
  slug: string;
  officialId?: string | null;
  publicCode?: string | null;
  name: string;
  nameKo: string;
  champion: string;
  set: string;
  rarity: string;
  cardType: string;
  domain?: string | null;
  energy?: number | null;
  might?: number | null;
  power?: number | null;
  orientation?: "portrait" | "landscape";
  tags?: string[];
  imageUrl: string | null;
  officialUrl: string;
  hasPrice?: boolean;
  rawPriceKrw: number | null;
  gradedPriceKrw: number | null;
  lowestPriceKrw: number | null;
  recentSoldPriceKrw: number | null;
  averagePriceKrw: number | null;
  rawPriceUsd?: number | null;
  gradedPriceUsd?: number | null;
  lowestPriceUsd?: number | null;
  recentSoldPriceUsd?: number | null;
  averagePriceUsd?: number | null;
  change24hPercent: number;
  confidence: PriceConfidence;
  priceLinks?: PriceSourceLink[];
  accent: string;
};

export type SealedProduct = {
  id: string;
  slug: string;
  name: string;
  nameKo: string;
  set: string;
  productType: string;
  packCount: number | null;
  cardsPerPack: number | null;
  msrpUsd: number | null;
  imageUrl: string | null;
  hasPrice?: boolean;
  lowestPriceKrw: number | null;
  recentSoldPriceKrw: number | null;
  averagePriceKrw: number | null;
  lowestPriceUsd?: number | null;
  recentSoldPriceUsd?: number | null;
  averagePriceUsd?: number | null;
  change24hPercent: number;
  confidence: PriceConfidence;
  priceLinks?: PriceSourceLink[];
};

export type MarketSource = {
  slug: string;
  name: string;
  baseUrl: string;
  currency: string;
  priority: number;
};

export type CatalogPayload = {
  mode: "mock" | "supabase";
  cards: CardItem[];
  sealedProducts: SealedProduct[];
  marketSources: MarketSource[];
  updatedAt: string;
};
