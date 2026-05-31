"use client";

/* eslint-disable @next/next/no-img-element */

import {
  Bell,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Eye,
  ExternalLink,
  Filter,
  Flame,
  LineChart,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  UserPlus,
  X,
} from "lucide-react";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { guides, mockCatalog, tabs } from "@/data/riftbound-data";
import { compactNumber, formatKstDateTime, usd, won } from "@/lib/format";
import type { CardItem, CatalogPayload, CurrencyMode, PriceSourceLink, SealedProduct, TabId } from "@/lib/riftbound-types";
import { getSupabaseBrowserClient, isGoogleAuthEnabled, isSupabaseAuthConfigured } from "@/lib/supabase-client";

type FilterState = {
  query: string;
  set: string;
  rarity: string;
  champion: string;
  cardType: string;
  sort: string;
};

type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl?: string | null;
  provider?: string | null;
};

type AuthProvider = "google";
type LegalPanelId = "terms" | "privacy" | "contact" | "data";

const emptyFilters: FilterState = {
  query: "",
  set: "all",
  rarity: "all",
  champion: "all",
  cardType: "all",
  sort: "average-desc",
};

const favoriteStorageKey = "riftbound.favoriteCardIds.v1";
const tabIdSet = new Set<TabId>(["home", ...tabs.map((tab) => tab.id)]);
const supportEmail = "beot.ai.team@gmail.com";

function readTabFromLocation(): TabId {
  if (typeof window === "undefined") return "home";
  const tab = new URLSearchParams(window.location.search).get("tab") as TabId | null;
  return tab && tabIdSet.has(tab) ? tab : "home";
}

function pushTabToLocation(tab: TabId) {
  if (typeof window === "undefined") return;
  const nextUrl = new URL(window.location.href);
  if (tab === "home") nextUrl.searchParams.delete("tab");
  else nextUrl.searchParams.set("tab", tab);
  const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextPath !== currentPath) window.history.pushState({ tab }, "", nextPath);
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function mapSupabaseAuthUser(user: SupabaseAuthUser | null | undefined): AuthUser | null {
  if (!user) return null;

  const metadata = user.user_metadata || {};
  const appMetadata = user.app_metadata || {};
  const rawName = metadata.name || metadata.full_name || metadata.preferred_username || user.email?.split("@")[0] || "Riftbound Collector";
  const avatarUrl = metadata.avatar_url || metadata.picture || null;
  const provider = typeof appMetadata.provider === "string" ? appMetadata.provider : null;

  return {
    id: user.id,
    name: String(rawName),
    email: user.email ?? null,
    avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
    provider,
  };
}

function price(currency: CurrencyMode, krw?: number | null, usdValue?: number | null) {
  if ((currency === "KRW" && (krw === undefined || krw === null)) || (currency === "USD" && usdValue === null && (krw === undefined || krw === null))) {
    return "가격 수집 전";
  }
  if (currency === "KRW") return won(krw);
  return usd(usdValue ?? Math.round(((krw || 0) / 1350) * 100) / 100);
}

function inferExchangeRate(cards: CardItem[]) {
  const priced = cards.find((card) => card.averagePriceKrw && card.averagePriceUsd);
  if (!priced?.averagePriceKrw || !priced.averagePriceUsd) return 1350;
  return Math.round((priced.averagePriceKrw / priced.averagePriceUsd) * 100) / 100;
}

function displayCurrencyValue(currency: CurrencyMode, krw: number, exchangeRate: number) {
  if (currency === "KRW") return Math.round(krw);
  return Math.round((krw / exchangeRate) * 100) / 100;
}

function parseCurrencyValue(currency: CurrencyMode, value: number, exchangeRate: number) {
  if (currency === "KRW") return Math.round(value);
  return Math.round(value * exchangeRate);
}

function formatMoney(currency: CurrencyMode, krw: number, exchangeRate: number) {
  if (currency === "KRW") return won(Math.round(krw));
  return usd(Math.round((krw / exchangeRate) * 100) / 100);
}

function numericPrice(card: CardItem, sort: string) {
  if (sort.includes("lowest")) return card.lowestPriceKrw ?? cardPriceValue(card);
  if (sort.includes("recent")) return card.recentSoldPriceKrw ?? cardPriceValue(card);
  return cardPriceValue(card);
}

function cardAverage(card: CardItem, currency: CurrencyMode) {
  return price(currency, card.averagePriceKrw, card.averagePriceUsd);
}

function cardLowest(card: CardItem, currency: CurrencyMode) {
  return price(currency, card.lowestPriceKrw, card.lowestPriceUsd);
}

function cardRecent(card: CardItem, currency: CurrencyMode) {
  return price(currency, card.recentSoldPriceKrw, card.recentSoldPriceUsd);
}

function cardGraded(card: CardItem, currency: CurrencyMode) {
  return price(currency, card.gradedPriceKrw, card.gradedPriceUsd);
}

function cardMarketPrice(card: CardItem, currency: CurrencyMode) {
  return price(
    currency,
    card.averagePriceKrw ?? card.recentSoldPriceKrw ?? card.rawPriceKrw ?? card.gradedPriceKrw,
    card.averagePriceUsd ?? card.recentSoldPriceUsd ?? card.rawPriceUsd ?? card.gradedPriceUsd,
  );
}

function cardPriceValue(card: CardItem) {
  return card.averagePriceKrw ?? card.recentSoldPriceKrw ?? card.rawPriceKrw ?? card.lowestPriceKrw ?? card.gradedPriceKrw ?? 0;
}

function cardIdentityKey(card: CardItem) {
  return [card.set, card.champion, card.name, card.cardType].map((value) => value.trim().toLowerCase()).join("|");
}

function dedupeCardsByIdentity(cards: CardItem[]) {
  const mapped = new Map<string, CardItem>();

  cards.forEach((card) => {
    const key = cardIdentityKey(card);
    const current = mapped.get(key);
    if (!current || cardPriceValue(card) > cardPriceValue(current)) {
      mapped.set(key, card);
    }
  });

  return Array.from(mapped.values());
}

function productAverage(product: SealedProduct, currency: CurrencyMode) {
  return price(currency, product.averagePriceKrw, product.averagePriceUsd);
}

function productLowest(product: SealedProduct, currency: CurrencyMode) {
  return price(currency, product.lowestPriceKrw, product.lowestPriceUsd);
}

function productRecent(product: SealedProduct, currency: CurrencyMode) {
  return price(currency, product.recentSoldPriceKrw, product.recentSoldPriceUsd);
}

function sourceLinkPrice(link: PriceSourceLink, currency: CurrencyMode) {
  return price(currency, link.priceKrw, link.priceUsd);
}

function sourceNativePrice(link: PriceSourceLink) {
  if (!link.priceNative || !link.currency) return null;
  if (link.currency === "USD") return usd(link.priceNative);
  if (link.currency === "KRW") return won(link.priceNative);
  if (link.currency === "EUR") return `€${link.priceNative.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `${link.priceNative.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${link.currency}`;
}

function Change({ value }: { value: number }) {
  const up = value >= 0;
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular-nums", up ? "text-[#51e879]" : "text-[#ff5757]")}>{up ? "▲" : "▼"} {Math.abs(value).toFixed(2)}%</span>;
}

function proxiedImageSrc(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function inferredProductSet(product: Pick<SealedProduct, "name" | "set" | "slug">) {
  const key = `${product.slug} ${product.name}`.toLowerCase();
  if (key.includes("proving-grounds") || key.includes("proving grounds")) return "Proving Grounds";
  if (key.includes("spiritforged")) return "Spiritforged";
  if (key.includes("unleashed")) return "Unleashed";
  if (key.includes("origins") || key.includes("booster-pack") || key.includes("starter-decks")) return "Origins";
  return product.set;
}

function cardsForProduct(product: SealedProduct, cards: CardItem[]) {
  const productSet = inferredProductSet(product);
  const setCards = cards.filter((card) => card.set === productSet && card.imageUrl);
  return (setCards.length ? setCards : cards.filter((card) => card.imageUrl)).slice(0, 4);
}

function productComposition(product: SealedProduct) {
  if (product.packCount && product.cardsPerPack) return `${product.packCount}팩 / ${product.cardsPerPack}장`;
  if (product.packCount) return `${product.packCount}팩`;
  if (product.cardsPerPack) return `${product.cardsPerPack}장 구성`;
  return "구성 확인";
}

function Panel({ children, className = "", ...props }: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode; className?: string }) {
  return <section className={cn("w-full min-w-0 max-w-full rounded-[8px] border border-[#23334c] bg-[#081525]/86 shadow-[0_18px_60px_rgba(0,0,0,0.28)]", className)} {...props}>{children}</section>;
}

function SectionTitle({ icon: Icon, title, action = "더보기", onAction }: { icon?: React.ElementType; title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-2 text-lg font-bold text-[#f5b85b]">
        {Icon ? <Icon className="h-5 w-5 text-[#b77bff]" /> : null}
        {title}
      </h2>
      {action ? (
        <button type="button" onClick={onAction} className="inline-flex items-center gap-1 text-sm text-[#9aa8bf] transition hover:text-white">
          {action} <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function CurrencyToggle({ value, onChange }: { value: CurrencyMode; onChange: (value: CurrencyMode) => void }) {
  return (
    <div className="grid h-9 grid-cols-2 overflow-hidden rounded-[7px] border border-[#2f4160] bg-[#071324] text-xs font-bold sm:h-10 sm:text-sm">
      {(["KRW", "USD"] as CurrencyMode[]).map((currency) => (
        <button
          key={currency}
          onClick={() => onChange(currency)}
          className={cn("px-2 transition sm:px-3", value === currency ? "bg-[#6233b5] text-white" : "text-[#aeb8ca] hover:bg-white/5")}
        >
          {currency}
        </button>
      ))}
    </div>
  );
}

function CardArt({
  item,
  tall = false,
  className = "",
}: {
  item: Pick<CardItem, "champion" | "name" | "nameKo" | "accent" | "imageUrl" | "orientation" | "publicCode">;
  tall?: boolean;
  className?: string;
}) {
  const landscape = item.orientation === "landscape";
  const imageSrc = proxiedImageSrc(item.imageUrl);

  return (
    <div className={cn("relative overflow-hidden rounded-[7px] border border-[#d99538]/70 bg-[#050910]", landscape && !tall ? "aspect-[7/5]" : tall ? "aspect-[5/7]" : "aspect-[4/5]", className)}>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 35% 24%, ${item.accent || "#7c3aed"}cc, transparent 26%), radial-gradient(circle at 78% 72%, #f5a62366, transparent 30%), linear-gradient(145deg, #111827 0%, #0b1220 45%, #030712 100%)`,
        }}
      />
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={item.name || item.nameKo}
          loading="eager"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.opacity = "0";
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="absolute inset-3 rounded-full border border-white/10 blur-[1px]" />
      )}
      {!item.imageUrl ? (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/70 to-transparent p-3">
          <div className="truncate text-sm font-bold text-white">{item.name || item.champion}</div>
          <div className="mt-0.5 truncate text-xs text-[#d4c6b1]">{item.publicCode || item.nameKo}</div>
        </div>
      ) : null}
    </div>
  );
}

function ProductArt({ product, cards = [], className = "" }: { product: SealedProduct; cards?: CardItem[]; className?: string }) {
  const previewCard = cards.find((card) => card.imageUrl);
  const productImage = proxiedImageSrc(product.imageUrl);

  if (productImage) {
    return (
      <div className={cn("relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[8px] bg-[radial-gradient(circle_at_50%_24%,rgba(147,51,234,0.22),transparent_58%),#070f1d]", className)}>
        <img src={productImage} alt={product.name} loading="lazy" className="h-full w-full scale-110 object-contain p-1 drop-shadow-[0_20px_34px_rgba(0,0,0,0.42)]" />
      </div>
    );
  }

  return (
    <div className={cn("relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[8px] bg-[radial-gradient(circle_at_50%_24%,rgba(147,51,234,0.22),transparent_58%),#070f1d]", className)}>
      <div className="grid h-24 w-24 place-items-center rounded-[8px] border border-[#d99538]/50 bg-[#101827] text-[#f8d58a]">
        <PackageOpen className="h-9 w-9" />
        <span className="sr-only">{product.name}</span>
      </div>
      {previewCard ? (
        <div className="absolute bottom-2 right-2 h-16 w-12 overflow-hidden rounded-[5px] border border-[#d99538]/50 opacity-70">
          <CardArt item={previewCard} tall className="h-full w-full border-0" />
        </div>
      ) : null}
    </div>
  );
}

function ProductBox({ product, currency, cards = [], onClick, className = "" }: { product: SealedProduct; currency: CurrencyMode; cards?: CardItem[]; onClick?: () => void; className?: string }) {
  const content = (
    <>
      <ProductArt product={product} cards={cards} className="h-44 w-full sm:mx-auto" />
      <div className="mt-4">
        <div className="text-sm text-[#cdbb9d]">{product.set}</div>
        <div className="mt-1 line-clamp-2 min-h-12 font-bold text-white">{product.name}</div>
        <div className="mt-3 text-xl font-bold text-[#f8d58a]">{productAverage(product, currency)}</div>
        <div className="mt-1"><Change value={product.change24hPercent} /></div>
        {onClick ? <div className="mt-3 text-xs font-bold text-[#b994ff]">클릭해서 상세 보기</div> : null}
      </div>
    </>
  );
  const classes = cn("block w-full rounded-[8px] border border-[#d99538]/60 bg-[#111827] p-4 text-left transition", onClick && "cursor-pointer hover:-translate-y-0.5 hover:border-[#c178ff] hover:bg-[#101d30]", className);

  return onClick ? <button type="button" onClick={onClick} className={classes}>{content}</button> : <div className={classes}>{content}</div>;
}

function cardSearchLinks(card: CardItem) {
  const query = encodeURIComponent(`Riftbound ${card.name}`);
  return [
    { label: "공식 카드 갤러리", url: card.officialUrl },
    { label: "PriceCharting 검색", url: `https://www.pricecharting.com/search-products?q=${query}&type=prices` },
    { label: "TCGplayer 검색", url: `https://www.tcgplayer.com/search/all/product?q=${query}` },
    { label: "Cardmarket 검색", url: `https://www.cardmarket.com/en/Riftbound/Products/Search?searchString=${query}` },
    { label: "eBay 검색", url: `https://www.ebay.com/sch/i.html?_nkw=${query}` },
  ];
}

function CardDetailPanel({
  card,
  currency,
  isFavorite = false,
  onClose,
  onToggleFavorite,
}: {
  card: CardItem;
  currency: CurrencyMode;
  isFavorite?: boolean;
  onClose: () => void;
  onToggleFavorite?: (card: CardItem) => void;
}) {
  const priceRows = [
    ["최저가", cardLowest(card, currency)],
    ["최근판매가", cardRecent(card, currency)],
    ["평균가", cardAverage(card, currency)],
    ["PSA 10", cardGraded(card, currency)],
  ];
  const stats = [
    ["세트", card.set],
    ["희귀도", card.rarity],
    ["타입", card.cardType],
    ["카드 번호", card.publicCode || "-"],
    ["도메인", card.domain || "-"],
    ["에너지", card.energy ?? "-"],
    ["Might", card.might ?? "-"],
    ["Power", card.power ?? "-"],
  ];
  const observedLinks = card.priceLinks || [];

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 p-3 backdrop-blur-sm md:p-6" onClick={onClose}>
      <aside
        onClick={(event) => event.stopPropagation()}
        className="ml-auto flex max-h-full w-full max-w-[1040px] flex-col overflow-hidden rounded-[8px] border border-[#33465f] bg-[#07111f] shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#243047] p-5">
          <div>
            <div className="text-sm font-bold uppercase text-[#f5b85b]">{card.champion}</div>
            <h2 className="mt-1 text-3xl font-bold text-white">{card.name}</h2>
            <p className="mt-1 text-[#9faabd]">{card.nameKo}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border border-[#33465f] bg-white/5 text-[#d7e0ef] transition hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-5 overflow-y-auto p-5 lg:grid-cols-[320px_1fr]">
          <div>
            <CardArt item={card} tall className="mx-auto max-w-[300px] shadow-[0_18px_55px_rgba(0,0,0,0.45)]" />
            <a
              href={card.officialUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex h-11 items-center justify-center gap-2 rounded-[7px] border border-[#9b62ff] bg-[#54259a]/70 font-bold text-white transition hover:bg-[#6233b5]"
            >
              공식 이미지 보기 <ExternalLink className="h-4 w-4" />
            </a>
            {onToggleFavorite ? (
              <button
                type="button"
                onClick={() => onToggleFavorite(card)}
                className={cn(
                  "mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[7px] border font-bold transition",
                  isFavorite ? "border-[#f5b85b] bg-[#2a1807] text-[#f5d18a]" : "border-[#33465f] bg-[#0b1728] text-[#d7e0ef] hover:border-[#9b62ff]",
                )}
              >
                <Bookmark className={cn("h-4 w-4", isFavorite && "fill-current")} />
                {isFavorite ? "관심 카드 해제" : "관심 카드 추가"}
              </button>
            ) : null}
          </div>
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              {priceRows.map(([label, value]) => (
                <div key={label} className="rounded-[8px] border border-[#263752] bg-[#0b1728] p-4">
                  <div className="text-sm text-[#9faabd]">{label}</div>
                  <div className="mt-2 text-xl font-bold text-white">{value}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {stats.map(([label, value]) => (
                <div key={label} className="rounded-[8px] border border-[#243047] bg-black/20 p-3">
                  <div className="text-xs text-[#8d9ab0]">{label}</div>
                  <div className="mt-1 truncate font-bold text-[#d7e0ef]">{value}</div>
                </div>
              ))}
            </div>
            <Panel className="p-5">
              <SectionTitle title="가격 소스 링크" action="" />
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {observedLinks.map((link) => (
                  <a
                    key={`${link.sourceSlug}-${link.observedUrl}`}
                    href={link.observedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-[8px] border border-[#2d3f5c] bg-[#0b1728] p-4 transition hover:border-[#9b62ff]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-[#f5b85b]">{link.sourceName}</span>
                      <ExternalLink className="h-4 w-4 text-[#9faabd]" />
                    </div>
                    <div className="mt-2 line-clamp-2 text-sm text-[#c7d0df]">{link.observedTitle || link.listingType || card.name}</div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="font-bold text-white">{price(currency, link.priceKrw, link.priceUsd)}</span>
                      <span className="text-[#8d9ab0]">{link.observedAt ? formatKstDateTime(link.observedAt) : "최근 수집"}</span>
                    </div>
                  </a>
                ))}
                {cardSearchLinks(card).map((link) => (
                  <a key={link.label} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-[8px] border border-[#243047] bg-black/20 px-4 py-3 text-sm font-bold text-[#d7e0ef] transition hover:border-[#9b62ff]">
                    {link.label}
                    <ExternalLink className="h-4 w-4 text-[#9faabd]" />
                  </a>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </aside>
    </div>
  );
}

function productSearchLinks(product: SealedProduct) {
  const query = encodeURIComponent(`Riftbound ${product.name}`);
  return [
    { label: "PriceCharting 검색", url: `https://www.pricecharting.com/search-products?q=${query}&type=prices` },
    { label: "TCGplayer 검색", url: `https://www.tcgplayer.com/search/all/product?q=${query}` },
    { label: "Cardmarket 검색", url: `https://www.cardmarket.com/en/Riftbound/Products/Search?searchString=${query}` },
    { label: "eBay 검색", url: `https://www.ebay.com/sch/i.html?_nkw=${query}` },
  ];
}

function ProductDetailPanel({ product, currency, cards, onClose }: { product: SealedProduct; currency: CurrencyMode; cards: CardItem[]; onClose: () => void }) {
  const priceRows: Array<[string, React.ReactNode]> = [
    ["최저가", productLowest(product, currency)],
    ["최근판매가", productRecent(product, currency)],
    ["평균가", productAverage(product, currency)],
    ["7일 변동률", <Change key="change" value={product.change24hPercent} />],
  ];
  const stats: Array<[string, React.ReactNode]> = [
    ["세트", product.set],
    ["상품 타입", product.productType.replaceAll("_", " ")],
    ["구성", productComposition(product)],
    ["공식 판매가", usd(product.msrpUsd)],
    ["신뢰도", product.confidence],
    ["상품 코드", product.slug],
  ];
  const observedLinks = product.priceLinks || [];

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 p-3 backdrop-blur-sm md:p-6" onClick={onClose}>
      <aside
        onClick={(event) => event.stopPropagation()}
        className="ml-auto flex max-h-full w-full max-w-[1040px] flex-col overflow-hidden rounded-[8px] border border-[#33465f] bg-[#07111f] shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#243047] p-5">
          <div>
            <div className="text-sm font-bold uppercase text-[#f5b85b]">{product.set}</div>
            <h2 className="mt-1 text-3xl font-bold text-white">{product.name}</h2>
            <p className="mt-1 text-[#9faabd]">{product.nameKo}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border border-[#33465f] bg-white/5 text-[#d7e0ef] transition hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-5 overflow-y-auto p-5 lg:grid-cols-[340px_1fr]">
          <div className="space-y-4">
            <ProductArt product={product} cards={cards} className="mx-auto h-56 w-full max-w-[340px]" />
            <Panel className="p-4">
              <div className="text-sm text-[#9faabd]">상품 구성</div>
              <div className="mt-2 text-2xl font-bold text-white">{productComposition(product)}</div>
              <div className="mt-1 text-sm text-[#8d9ab0]">미개봉 기준 가격과 거래 링크를 함께 확인합니다.</div>
            </Panel>
            {cards.length ? (
              <Panel className="p-4">
                <div className="text-sm font-bold text-[#f5b85b]">세트 대표 카드</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {cards.slice(0, 3).map((card) => <CardArt key={card.id} item={card} tall className="h-24 w-full" />)}
                </div>
              </Panel>
            ) : null}
          </div>
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              {priceRows.map(([label, value]) => (
                <div key={label} className="rounded-[8px] border border-[#263752] bg-[#0b1728] p-4">
                  <div className="text-sm text-[#9faabd]">{label}</div>
                  <div className="mt-2 text-xl font-bold text-white">{value}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {stats.map(([label, value]) => (
                <div key={label} className="rounded-[8px] border border-[#243047] bg-black/20 p-3">
                  <div className="text-xs text-[#8d9ab0]">{label}</div>
                  <div className="mt-1 truncate font-bold text-[#d7e0ef]">{value}</div>
                </div>
              ))}
            </div>
            <Panel className="p-5">
              <SectionTitle title="거래/가격 링크" action="" />
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {observedLinks.map((link) => (
                  <a key={`${link.sourceSlug}-${link.observedUrl}`} href={link.observedUrl} target="_blank" rel="noreferrer" className="rounded-[8px] border border-[#2d3f5c] bg-[#0b1728] p-4 transition hover:border-[#9b62ff]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-[#f5b85b]">{link.sourceName}</span>
                      <ExternalLink className="h-4 w-4 text-[#9faabd]" />
                    </div>
                    <div className="mt-2 line-clamp-2 text-sm text-[#c7d0df]">{link.observedTitle || link.listingType || product.name}</div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="font-bold text-white">{price(currency, link.priceKrw, link.priceUsd)}</span>
                      <span className="text-[#8d9ab0]">{link.observedAt ? formatKstDateTime(link.observedAt) : "최근 수집"}</span>
                    </div>
                  </a>
                ))}
                {productSearchLinks(product).map((link) => (
                  <a key={link.label} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-[8px] border border-[#243047] bg-black/20 px-4 py-3 text-sm font-bold text-[#d7e0ef] transition hover:border-[#9b62ff]">
                    {link.label}
                    <ExternalLink className="h-4 w-4 text-[#9faabd]" />
                  </a>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </aside>
    </div>
  );
}

function AccountModal({
  authError,
  authReady,
  currentUser,
  isAuthConfigured,
  onClose,
  onLogout,
  onSignin,
}: {
  authError: string | null;
  authReady: boolean;
  currentUser: AuthUser | null;
  isAuthConfigured: boolean;
  onClose: () => void;
  onLogout: () => Promise<void>;
  onSignin: (provider: AuthProvider) => Promise<void>;
}) {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<AuthProvider | null>(null);
  const googleReady = isAuthConfigured && isGoogleAuthEnabled();
  const canStartAuth = authReady && googleReady && ageConfirmed && termsAccepted && !loadingProvider;

  const startSignin = async (provider: AuthProvider) => {
    if (!canStartAuth) return;
    setLoadingProvider(provider);
    await onSignin(provider);
    setLoadingProvider(null);
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <Panel className="w-full max-w-[560px] p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-[#243047] p-5">
          <div>
            <h2 className="text-2xl font-bold text-white">{currentUser ? "내 계정" : "회원가입 / 로그인"}</h2>
            <p className="mt-1 text-sm text-[#9faabd]">시세 확인은 비회원도 가능하고, 커뮤니티 글과 댓글은 회원만 작성할 수 있습니다.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-[6px] border border-[#33465f] bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {currentUser ? (
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-4 rounded-[8px] border border-[#263752] bg-[#0b1728] p-4">
              {currentUser.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="" className="h-14 w-14 rounded-full border border-[#f4ae45] object-cover" />
              ) : (
                <div className="grid h-14 w-14 place-items-center rounded-full border border-[#f4ae45] bg-[#6233b5] text-xl font-bold">
                  {currentUser.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm text-[#9faabd]">로그인 계정</div>
                <div className="truncate text-xl font-bold">{currentUser.name}</div>
                <div className="truncate text-sm text-[#9faabd]">{currentUser.email || "이메일 비공개"}</div>
                {currentUser.provider ? <div className="mt-1 text-xs uppercase text-[#f5b85b]">{currentUser.provider}</div> : null}
              </div>
            </div>
            <button type="button" onClick={onLogout} className="flex h-11 w-full items-center justify-center gap-2 rounded-[7px] border border-[#33465f] text-[#d7e0ef] transition hover:bg-white/5">
              <LogOut className="h-4 w-4" /> 로그아웃
            </button>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            {!isAuthConfigured ? (
              <div className="rounded-[7px] border border-[#7c4d1f] bg-[#2a1807] p-3 text-sm text-[#f6d19a]">
                Supabase 공개 URL과 publishable key가 필요합니다. `.env.local`을 설정한 뒤 다시 실행하면 소셜 로그인이 활성화됩니다.
              </div>
            ) : null}
            {isAuthConfigured && !isGoogleAuthEnabled() ? (
              <div className="rounded-[7px] border border-[#7c4d1f] bg-[#2a1807] p-3 text-sm text-[#f6d19a]">
                Google 로그인은 Supabase Provider 설정 완료 후 활성화됩니다. 지금은 게스트로 모든 시세 화면을 볼 수 있습니다.
              </div>
            ) : null}
            {authError ? <div className="rounded-[7px] border border-[#7c2b38] bg-[#2a0910] p-3 text-sm text-[#ffb8c2]">{authError}</div> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => startSignin("google")} disabled={!canStartAuth} className="flex h-12 items-center justify-center gap-3 rounded-[7px] border border-[#33465f] bg-white text-sm font-bold text-[#111827] transition enabled:hover:bg-[#f2f4f7] disabled:cursor-not-allowed disabled:opacity-45">
                {loadingProvider === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-[#4285f4] text-xs text-white">G</span>}
                {googleReady ? "Google로 계속하기" : "Google 로그인 설정 필요"}
              </button>
              <button type="button" onClick={onClose} className="flex h-12 items-center justify-center rounded-[7px] border border-[#33465f] bg-[#071324] text-sm font-bold text-[#d7e0ef] transition hover:border-[#9b62ff] hover:bg-white/5">
                게스트로 둘러보기
              </button>
            </div>

            <div className="space-y-3 rounded-[8px] border border-[#263752] bg-black/20 p-4 text-sm text-[#c7d0df]">
              <div className="font-bold text-[#f5b85b]">Google 가입 전 확인사항</div>
              <label className="flex gap-3">
                <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-[#8b5cf6]" />
                <span>만 14세 이상이며, 커뮤니티에서 허위 시세 조작/사기 유도/저작권 침해 게시물을 작성하지 않겠습니다.</span>
              </label>
              <label className="flex gap-3">
                <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-[#8b5cf6]" />
                <span>이용약관, 개인정보 처리방침, 커뮤니티 운영원칙, 가격 정보 면책 고지를 확인했습니다.</span>
              </label>
              <div className="grid gap-2 border-t border-[#243047] pt-3 text-xs leading-5 text-[#91a0b8]">
                <p>게스트는 카드, 시세, 계산기, 가이드를 볼 수 있지만 커뮤니티 글쓰기와 댓글 작성은 Google 로그인 후 가능합니다.</p>
                <p>가격 정보는 참고용이며 실제 거래 체결가, 배송비, 관부가세, 환율에 따라 달라질 수 있습니다.</p>
                <p>회원 정보는 로그인 제공자 식별값, 이메일, 닉네임, 프로필 이미지를 커뮤니티 작성자 표시와 계정 관리 목적으로만 사용합니다.</p>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Header({
  activeTab,
  onTabChange,
  currency,
  onCurrencyChange,
  currentUser,
  onAccountClick,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  currency: CurrencyMode;
  onCurrencyChange: (value: CurrencyMode) => void;
  currentUser: AuthUser | null;
  onAccountClick: () => void;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-[#243047] bg-[#050a13]/92 backdrop-blur-xl">
      <div className="mx-auto flex min-h-18 max-w-[1540px] items-center gap-2 px-3 py-3 sm:h-20 sm:gap-5 sm:px-5 sm:py-0">
        <button onClick={() => onTabChange("home")} className="mr-1 min-w-0 shrink text-left sm:mr-4 sm:min-w-56">
          <div className="font-display text-3xl font-bold leading-none text-[#f3bd68] sm:text-4xl">Riftbound</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f4a84a] sm:text-xs sm:tracking-[0.28em]">Trading Card Game</div>
        </button>
        <nav className="hidden flex-1 items-stretch justify-center gap-2 2xl:flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "flex min-w-28 items-center justify-center gap-2 border-b-2 px-3 text-base transition",
                  active ? "border-[#c178ff] bg-[#5a32a6]/20 text-white shadow-[0_10px_30px_rgba(168,85,247,0.22)]" : "border-transparent text-[#d5b78f] hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-5 w-5 text-[#f0a64b]" />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
          <CurrencyToggle value={currency} onChange={onCurrencyChange} />
          <Search className="hidden h-6 w-6 text-[#d7ddea] sm:block" />
          <Bell className="hidden h-5 w-5 text-[#d7ddea] sm:block" />
          <button onClick={onAccountClick} aria-label={currentUser ? "내 계정" : "회원가입"} className={cn("flex h-10 shrink-0 items-center justify-center rounded-full border-2 border-[#f4ae45] bg-gradient-to-br from-[#6630b2] to-[#11243d] font-bold whitespace-nowrap sm:h-11", currentUser ? "w-10 text-base sm:w-11 sm:text-lg" : "w-10 text-sm sm:w-auto sm:px-4")}>
            {currentUser ? currentUser.name.slice(0, 1).toUpperCase() : <span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">가입</span></span>}
          </button>
          <button className="hidden md:block 2xl:hidden">
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>
      <nav className="scrollbar-none mx-auto flex max-w-[1540px] gap-2 overflow-x-auto border-t border-[#141f31] px-3 py-2 sm:px-5 2xl:hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => onTabChange(tab.id)} className={cn("flex shrink-0 items-center gap-2 rounded-[6px] px-3 py-2 text-sm", active ? "bg-[#5a32a6]/60 text-white" : "text-[#d5b78f]")}>
              <Icon className="h-4 w-4 text-[#f0a64b]" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

const legalPanels: Record<LegalPanelId, { title: string; summary: string; sections: Array<{ heading: string; body: string; items?: string[] }> }> = {
  terms: {
    title: "이용약관",
    summary: "Riftbound 한국 시세/컬렉션/가격비교 허브를 이용할 때 적용되는 기본 약속입니다.",
    sections: [
      {
        heading: "서비스 성격",
        body: "본 사이트는 Riftbound: League of Legends Trading Card Game 팬을 위한 비공식 정보 서비스입니다. Riot Games, Inc.가 제작, 후원, 승인하거나 운영하는 공식 서비스가 아닙니다.",
        items: ["카드 검색, 시세 비교, 컬렉션 관리, 리셀 계산기, 커뮤니티 기능을 제공합니다.", "표시 가격은 참고용이며 실제 거래 체결가, 배송비, 관부가세, 환율에 따라 달라질 수 있습니다.", "외부 거래소 이동 후 발생하는 구매, 판매, 배송, 환불, 분쟁은 해당 플랫폼의 정책을 따릅니다."],
      },
      {
        heading: "회원과 커뮤니티",
        body: "비회원도 가격과 카드 정보는 볼 수 있지만, 글쓰기와 댓글 등 커뮤니티 활동은 로그인 회원에게만 제공됩니다.",
        items: ["허위 시세 조작, 사기 유도, 불법 거래, 타인의 권리 침해 게시물은 제한될 수 있습니다.", "저작권 또는 상표권 침해 신고가 접수되면 관련 콘텐츠를 검토 후 비공개 또는 삭제할 수 있습니다.", "운영 안정성, 보안, 법적 요청 대응을 위해 일부 기능을 일시 제한할 수 있습니다."],
      },
      {
        heading: "변경과 고지",
        body: "서비스 기능, 데이터 구조, 이용 조건은 운영 상황에 따라 변경될 수 있습니다. 중요한 변경은 사이트 내 공지 또는 커뮤니티 영역을 통해 안내합니다.",
      },
    ],
  },
  privacy: {
    title: "개인정보처리방침",
    summary: "로그인과 커뮤니티 기능 제공에 필요한 최소한의 정보만 사용합니다.",
    sections: [
      {
        heading: "수집 항목",
        body: "구글 로그인 사용 시 인증 제공자로부터 전달되는 기본 프로필 정보를 사용합니다.",
        items: ["이메일 주소, 표시 이름, 프로필 이미지, 인증 제공자 식별자", "커뮤니티 글/댓글 작성 내용과 작성 시간", "관심 카드, 필터 같은 개인화 데이터는 현재 브라우저 저장소 또는 Supabase 계정 데이터로 관리될 수 있습니다."],
      },
      {
        heading: "이용 목적",
        body: "수집한 정보는 계정 식별, 커뮤니티 작성자 표시, 부정 이용 방지, 사용자가 저장한 관심 카드 제공을 위해 사용합니다.",
        items: ["가격 조회 자체는 회원가입 없이 사용할 수 있습니다.", "마케팅 메일 발송이나 외부 판매 목적의 개인정보 제공은 하지 않습니다.", "서비스 운영에는 Vercel, Supabase, Google OAuth 등 인프라 제공자가 사용될 수 있습니다."],
      },
      {
        heading: "보관과 삭제",
        body: `계정 또는 커뮤니티 데이터 삭제 요청은 ${supportEmail} 으로 접수할 수 있습니다. 운영 확인 후 합리적인 기간 안에 처리합니다.`,
      },
    ],
  },
  contact: {
    title: "문의하기",
    summary: `서비스 문의, 데이터 수정 요청, 저작권/상표권 관련 연락은 ${supportEmail} 로 보내주세요.`,
    sections: [
      {
        heading: "문의 주소",
        body: supportEmail,
        items: ["가격 데이터 오류 제보", "카드 이미지 또는 카드명 오류 제보", "커뮤니티 게시물 신고", "제휴, 데이터 제공, 운영 관련 문의"],
      },
      {
        heading: "문의 시 포함하면 좋은 정보",
        body: "빠른 확인을 위해 카드명, 세트명, 문제 화면, 참고 링크, 확인한 시간대를 함께 보내주세요.",
      },
    ],
  },
  data: {
    title: "데이터 제공 안내",
    summary: "카드 정보와 시세 정보의 출처, 계산 방식, 한계를 투명하게 안내합니다.",
    sections: [
      {
        heading: "카드 정보",
        body: "카드명, 세트, 번호, 이미지, 카드 타입은 Riftbound 공식 카드 갤러리와 공식 상품 페이지를 기준으로 구성합니다.",
        items: ["공식 이미지가 로딩되지 않는 경우 프록시 캐시 또는 임시 플레이스홀더가 표시될 수 있습니다.", "카드 분류와 태그는 검색 편의를 위해 일부 정규화될 수 있습니다."],
      },
      {
        heading: "시세 정보",
        body: "가격은 공개적으로 확인 가능한 거래소와 가격비교 페이지를 참고해 최저가, 최근판매가, 평균가 형태로 정리합니다.",
        items: ["참고 소스: TCGplayer, Cardmarket, eBay, PriceCharting 등", "KRW/USD 표시는 수집 시점의 환율과 원 가격 기준에 따라 환산합니다.", "자동 업데이트 목표 시간은 KST 기준 09:00, 15:00, 20:00입니다."],
      },
      {
        heading: "면책 고지",
        body: "표시된 가격은 투자, 구매, 판매를 보장하는 정보가 아닙니다. 실제 거래 전에는 반드시 판매처의 재고, 상태, 배송비, 세금, 환불 조건을 직접 확인해야 합니다.",
      },
    ],
  },
};

function Footer({ mode, count, onOpenLegal }: { mode: CatalogPayload["mode"]; count: number; onOpenLegal: (panel: LegalPanelId) => void }) {
  const links: Array<[LegalPanelId, string]> = [
    ["terms", "이용약관"],
    ["privacy", "개인정보처리방침"],
    ["contact", "문의하기"],
    ["data", "데이터 제공 안내"],
  ];

  return (
    <footer className="mt-6 border-t border-[#1d2a40] px-6 py-6 text-sm text-[#8b96aa]">
      <div className="mx-auto flex max-w-[1540px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-6">
          <div className="font-display text-2xl font-bold text-[#6d3cc9]">Riftbound</div>
          <p>Riftbound is a trademark of Riot Games, Inc. This prototype is an unofficial fan market hub. Data mode: {mode}. Cards: {compactNumber(count)}.</p>
        </div>
        <div className="flex flex-wrap gap-5">
          {links.map(([id, label]) => (
            <button key={id} type="button" onClick={() => onOpenLegal(id)} className="transition hover:text-[#f5b85b]">
              {label}
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}

function LegalInfoPanel({ panel, onClose }: { panel: LegalPanelId; onClose: () => void }) {
  const content = legalPanels[panel];

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 p-3 backdrop-blur-sm md:p-6" onClick={onClose}>
      <aside
        onClick={(event) => event.stopPropagation()}
        className="mx-auto flex max-h-full w-full max-w-[920px] flex-col overflow-hidden rounded-[8px] border border-[#33465f] bg-[#07111f] shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#243047] p-5">
          <div>
            <div className="text-sm font-bold uppercase text-[#f5b85b]">Riftbound TCG.LOL</div>
            <h2 className="mt-1 text-3xl font-bold text-white">{content.title}</h2>
            <p className="mt-2 max-w-3xl leading-6 text-[#a8b3c8]">{content.summary}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border border-[#33465f] bg-white/5 text-[#d7e0ef] transition hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="grid gap-4">
            {content.sections.map((section) => (
              <section key={section.heading} className="rounded-[8px] border border-[#243047] bg-[#0b1728] p-5">
                <h3 className="text-lg font-bold text-[#f5b85b]">{section.heading}</h3>
                <p className="mt-2 leading-7 text-[#d7e0ef]">{section.body}</p>
                {section.items ? (
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-[#a8b3c8]">
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#51e879]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#2d3f5c] bg-black/20 p-4 text-sm text-[#c7d0df]">
            <span>문의: {supportEmail}</span>
            <a href={`mailto:${supportEmail}`} className="inline-flex h-10 items-center gap-2 rounded-[7px] border border-[#9b62ff] px-4 font-bold text-white transition hover:bg-[#51258e]/50">
              메일 보내기
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}

function uniqueOptions(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b));
}

const searchAliasGroups = [
  ["origins", "origin", "오리진", "오리진스"],
  ["spiritforged", "spirit forged", "스피릿포지드", "스피릿 포지드", "스피릿"],
  ["unleashed", "언리쉬드", "언리시드"],
  ["proving grounds", "proving", "프로빙그라운드", "프로빙 그라운드", "프로빙"],
  ["ven", "벤", "밴"],
  ["showcase", "쇼케이스"],
  ["signature", "시그니처", "사인", "서명"],
  ["champion", "챔피언"],
  ["legend", "레전드", "전설"],
  ["unit", "유닛"],
  ["spell", "스펠", "주문"],
  ["gear", "기어", "장비"],
  ["battlefield", "배틀필드", "전장"],
];

function normalizedSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function expandedSearchText(values: Array<string | null | undefined>) {
  const tokens = new Set<string>();

  values
    .filter(Boolean)
    .map(String)
    .forEach((value) => {
      const normalized = normalizedSearchText(value);
      if (!normalized) return;
      tokens.add(normalized);

      searchAliasGroups.forEach((group) => {
        if (group.some((alias) => normalized.includes(alias))) {
          group.forEach((alias) => tokens.add(alias));
        }
      });
    });

  return Array.from(tokens).join(" ");
}

function queryMatches(haystack: string, query: string) {
  const normalized = normalizedSearchText(query);
  if (!normalized) return true;

  const variants = new Set([normalized]);
  searchAliasGroups.forEach((group) => {
    if (group.some((alias) => normalized.includes(alias))) {
      group.forEach((alias) => variants.add(alias));
    }
  });

  return Array.from(variants).some((variant) => haystack.includes(variant));
}

function filterCards(cards: CardItem[], filters: FilterState) {
  const query = filters.query.trim();
  return cards.filter((card) => {
    const haystack = expandedSearchText([card.name, card.nameKo, card.champion, card.set, card.rarity, card.cardType, card.publicCode, ...(card.tags || [])]);
    return (
      queryMatches(haystack, query) &&
      (filters.set === "all" || card.set === filters.set) &&
      (filters.rarity === "all" || card.rarity === filters.rarity) &&
      (filters.champion === "all" || card.champion === filters.champion || (card.tags || []).includes(filters.champion)) &&
      (filters.cardType === "all" || card.cardType.includes(filters.cardType))
    );
  });
}

function sortCards(cards: CardItem[], sort: string) {
  if (sort === "default") return cards;

  return [...cards].sort((left, right) => {
    if (sort === "name-asc") return left.name.localeCompare(right.name);
    if (sort === "name-desc") return right.name.localeCompare(left.name);

    const leftValue = numericPrice(left, sort);
    const rightValue = numericPrice(right, sort);
    const leftHasPrice = leftValue !== null && leftValue !== undefined;
    const rightHasPrice = rightValue !== null && rightValue !== undefined;

    if (leftHasPrice && !rightHasPrice) return -1;
    if (!leftHasPrice && rightHasPrice) return 1;
    if (!leftHasPrice && !rightHasPrice) return left.name.localeCompare(right.name);

    if (sort.endsWith("asc")) return Number(leftValue) - Number(rightValue);
    return Number(rightValue) - Number(leftValue);
  });
}

function topChampionEntries(cards: CardItem[]) {
  const bestByChampion = new Map<string, CardItem>();

  cards.forEach((card) => {
    const champion = card.champion?.trim();
    if (!champion) return;

    const current = bestByChampion.get(champion);
    if (!current || cardPriceValue(card) > cardPriceValue(current)) {
      bestByChampion.set(champion, card);
    }
  });

  return Array.from(bestByChampion.entries())
    .map(([champion, bestCard]) => ({ champion, bestCard, priceValue: cardPriceValue(bestCard) }))
    .sort((left, right) => right.priceValue - left.priceValue || left.champion.localeCompare(right.champion));
}

function championResultTitle(filters: FilterState) {
  const parts: string[] = [];
  const query = filters.query.trim();

  if (filters.set !== "all") parts.push(filters.set);
  if (filters.rarity !== "all") parts.push(filters.rarity);
  if (filters.champion !== "all") parts.push(filters.champion);
  if (query) parts.push(`"${query}" 검색`);

  if (parts.length) return `${parts.join(" · ")} 카드`;
  return "챔피언 카드";
}

function SearchInput({ value, onChange, placeholder = "카드명, 챔피언, 세트 검색..." }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-[6px] border border-[#2a3b56] bg-[#0b1728] px-3 text-[#77859b]">
      <Search className="h-4 w-4" />
      <input className="min-w-0 flex-1 bg-transparent text-sm text-[#d7e0ef] outline-none placeholder:text-[#77859b]" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-[#c6d0e4]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-[6px] border border-[#2a3b56] bg-[#0b1728] px-3 text-[#d7e0ef]">
        <option value="all">전체</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SidebarFilters({ cards, filters, onChange, title = "필터" }: { cards: CardItem[]; filters: FilterState; onChange: (next: FilterState) => void; title?: string }) {
  const options = useMemo(
    () => ({
      sets: uniqueOptions(cards.map((card) => card.set)),
      rarities: uniqueOptions(cards.map((card) => card.rarity)),
      champions: uniqueOptions(cards.flatMap((card) => [card.champion, ...(card.tags || [])])),
      cardTypes: uniqueOptions(cards.flatMap((card) => card.cardType.split(" / "))),
    }),
    [cards],
  );

  const update = (key: keyof FilterState, value: string) => onChange({ ...filters, [key]: value });

  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[#c6a7ff]">
          <Filter className="h-4 w-4" />
          {title}
        </h2>
        <button onClick={() => onChange(emptyFilters)} className="flex items-center gap-1 text-sm text-[#aab5c8]">
          <RefreshCw className="h-4 w-4" /> 초기화
        </button>
      </div>
      <div className="mt-5 space-y-4">
        <SearchInput value={filters.query} onChange={(value) => update("query", value)} />
        <SelectField label="세트" value={filters.set} options={options.sets} onChange={(value) => update("set", value)} />
        <SelectField label="희귀도" value={filters.rarity} options={options.rarities} onChange={(value) => update("rarity", value)} />
        <SelectField label="챔피언 / 태그" value={filters.champion} options={options.champions} onChange={(value) => update("champion", value)} />
        <SelectField label="카드 타입" value={filters.cardType} options={options.cardTypes} onChange={(value) => update("cardType", value)} />
        <label className="block">
          <span className="text-sm text-[#c6d0e4]">정렬</span>
          <select value={filters.sort} onChange={(event) => update("sort", event.target.value)} className="mt-2 h-11 w-full rounded-[6px] border border-[#2a3b56] bg-[#0b1728] px-3 text-[#d7e0ef]">
            <option value="default">기본 순서</option>
            <option value="average-desc">평균가 높은순</option>
            <option value="average-asc">평균가 낮은순</option>
            <option value="lowest-asc">최저가 낮은순</option>
            <option value="lowest-desc">최저가 높은순</option>
            <option value="recent-desc">최근판매가 높은순</option>
            <option value="name-asc">이름 A-Z</option>
          </select>
        </label>
        <div className="rounded-[7px] border border-[#263752] bg-black/20 p-3 text-sm text-[#aab5c8]">
          현재 결과 <span className="font-bold text-white">{compactNumber(filterCards(cards, filters).length)}</span>장 · 가격 수집 <span className="font-bold text-white">{compactNumber(filterCards(cards, filters).filter((card) => card.hasPrice).length)}</span>장
        </div>
      </div>
    </Panel>
  );
}

function MetricStrip({ catalog, currency }: { catalog: CatalogPayload; currency: CurrencyMode }) {
  const pricedCards = sortCards(catalog.cards.filter((card) => card.hasPrice), "average-desc");
  const topCard = pricedCards[0] || catalog.cards[0];
  const topProduct = catalog.sealedProducts[0];

  return (
    <Panel className="grid gap-0 p-0 md:grid-cols-5">
      {[
        ["공식 카드 수", `${compactNumber(catalog.cards.length)}장`, "Riftbound 공식 갤러리 기준"],
        ["최고가 카드", `${topCard.champion} ${topCard.name}`, cardMarketPrice(topCard, currency)],
        ["24시간 급등 카드", `${catalog.cards[1]?.champion || "-"} ${catalog.cards[1]?.name || ""}`, `+${catalog.cards[1]?.change24hPercent || 0}%`],
        ["마지막 업데이트", formatKstDateTime(catalog.updatedAt), "자동화 기준"],
        ["대표 미개봉", topProduct.name, productAverage(topProduct, currency)],
      ].map(([title, value, sub], index) => (
        <div key={title} className={cn("p-5", index ? "border-t border-[#243047] md:border-l md:border-t-0" : "")}>
          <div className="text-sm text-[#f5b85b]">{title}</div>
          <div className="mt-2 truncate text-2xl font-bold text-white">{value}</div>
          <div className="mt-1 text-sm text-[#8c9ab0]">{sub}</div>
        </div>
      ))}
    </Panel>
  );
}

function HomeView({
  catalog,
  currency,
  onTabChange,
  onOpenCard,
  onOpenProduct,
  onShowCards,
}: {
  catalog: CatalogPayload;
  currency: CurrencyMode;
  onTabChange: (tab: TabId) => void;
  onOpenCard: (card: CardItem) => void;
  onOpenProduct: (product: SealedProduct) => void;
  onShowCards: (filters?: Partial<FilterState>) => void;
}) {
  const pricedCards = sortCards(catalog.cards.filter((card) => card.hasPrice), "average-desc");
  const heroCards = pricedCards.length ? pricedCards : catalog.cards;
  const featuredSealedProducts = catalog.sealedProducts.filter((product) => product.imageUrl).slice(0, 3);
  const sourceTargetProduct =
    catalog.sealedProducts.find((product) => product.slug === "origins-booster-display" && product.priceLinks?.length) ||
    catalog.sealedProducts.find((product) => product.priceLinks?.length) ||
    catalog.sealedProducts[0];
  const sourceRows = catalog.marketSources.map((source) => ({
    source,
    link: sourceTargetProduct?.priceLinks?.find((link) => link.sourceSlug === source.slug) || null,
  }));

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-6 md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_58%_20%,rgba(129,65,255,0.32),transparent_24rem),radial-gradient(circle_at_86%_40%,rgba(245,184,91,0.18),transparent_22rem)]" />
        <div className="absolute right-0 top-0 hidden h-full w-1/2 opacity-90 xl:block">
          <div className="grid h-full grid-cols-4 items-end gap-3 p-8">
            {heroCards.slice(0, 4).map((card, index) => (
              <button key={card.id} type="button" onClick={() => onOpenCard(card)} className={cn("text-left transition hover:-translate-y-1", index % 2 ? "mb-12" : "")}>
                <CardArt item={card} tall className="shadow-[0_18px_42px_rgba(0,0,0,0.35)]" />
              </button>
            ))}
          </div>
        </div>
        <div className="relative max-w-2xl py-6 xl:max-w-xl 2xl:max-w-2xl">
          <h1 className="font-display text-[3.35rem] font-bold leading-none text-[#f3bd68] sm:text-6xl md:text-8xl">Riftbound</h1>
          <p className="mt-3 text-3xl font-bold text-[#f5c98a]">한국 시세 · 컬렉션 · 가격비교</p>
          <p className="mt-5 max-w-lg text-lg leading-8 text-[#c7d0df]">공식 카드 이미지와 카드 구성을 기준으로 가격, 세트, 챔피언, 컬렉션을 한곳에서 확인하세요.</p>
          <div className="mt-7 max-w-2xl">
            <SearchInput value="" onChange={() => onTabChange("cards")} placeholder="카드명, 챔피언, 세트, 상품 검색..." />
          </div>
          <div className="mt-6 flex flex-wrap gap-4">
            <button onClick={() => onShowCards()} className="rounded-[8px] border border-[#9b62ff] bg-[#54259a]/70 px-7 py-4 font-bold text-white shadow-[0_0_28px_rgba(147,51,234,0.25)]">카드 시세 보기</button>
            <button onClick={() => onTabChange("market")} className="rounded-[8px] border border-[#3c4b68] bg-[#0c1728] px-7 py-4 font-bold text-[#d7e0ef]">미개봉 보기</button>
            <button onClick={() => onTabChange("calculator")} className="rounded-[8px] border border-[#8a6031] bg-[#17131c] px-7 py-4 font-bold text-[#f3bd68]">리셀 계산기</button>
          </div>
        </div>
      </Panel>
      <MetricStrip catalog={catalog} currency={currency} />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr_0.9fr]">
        <Panel className="p-5">
          <SectionTitle icon={Sparkles} title="TOP 시그니처 카드" onAction={() => onShowCards({ rarity: "Showcase", sort: "average-desc" })} />
          <div className="mt-5 grid grid-cols-3 gap-4">
            {heroCards.slice(0, 3).map((card, index) => (
              <button key={card.id} type="button" onClick={() => onOpenCard(card)} className="text-left">
                <div className="mb-2 inline-grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#f5b85b] to-[#6f3fc1] font-bold">{index + 1}</div>
                <CardArt item={card} tall className="transition hover:border-[#c178ff]" />
                <div className="mt-2 truncate text-lg font-bold">{card.name}</div>
                <div className="text-sm text-[#99a6bb]">{card.publicCode || card.set}</div>
                <div className="mt-1 font-bold">{cardMarketPrice(card, currency)}</div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel className="p-5">
          <SectionTitle icon={LineChart} title="미개봉 상품 인기 TOP 3" onAction={() => onTabChange("market")} />
          <div className="mt-5 grid grid-cols-3 gap-4">
            {featuredSealedProducts.map((product) => <ProductBox key={product.id} product={product} currency={currency} cards={cardsForProduct(product, catalog.cards)} onClick={() => onOpenProduct(product)} />)}
          </div>
        </Panel>
        <Panel className="p-5">
          <SectionTitle icon={LineChart} title="시세 소스" onAction={() => onShowCards({ sort: "average-desc" })} />
          <table className="mt-5 w-full overflow-hidden rounded-[8px] text-sm">
            <tbody>
              {sourceRows.map(({ source, link }) => (
                <tr key={source.slug} className="border-b border-[#243047]">
                  <td className="py-3 text-[#aab5c8]">
                    <div>{source.name}</div>
                    <div className="mt-0.5 max-w-[13rem] truncate text-xs text-[#6f7d93]">{link?.observedTitle || sourceTargetProduct?.name || "수집 대기"}</div>
                  </td>
                  <td className="py-3 text-right font-bold">
                    {link ? (
                      <a href={link.observedUrl} target="_blank" rel="noreferrer" className="transition hover:text-[#c178ff]">{sourceLinkPrice(link, currency)}</a>
                    ) : (
                      <span className="text-[#7f8ba0]">수집 대기</span>
                    )}
                    {link ? <div className="mt-0.5 text-xs font-normal text-[#7f8ba0]">{sourceNativePrice(link) || link.currency}</div> : null}
                  </td>
                  <td className="py-3 text-right text-xs font-bold text-[#cbd6e8]">{link?.currency || source.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

function CardTable({ cards, currency, limit = 80, onOpenCard }: { cards: CardItem[]; currency: CurrencyMode; limit?: number; onOpenCard?: (card: CardItem) => void }) {
  const visibleCards = cards.slice(0, limit);
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#243047] p-5 md:flex-row md:items-center">
        <h2 className="text-xl font-bold text-[#c6a7ff]">
          카드 목록 <span className="ml-4 text-base font-normal text-[#9ca8bc]">{compactNumber(cards.length)}장</span>
        </h2>
        <div className="ml-auto text-sm text-[#8d9ab0]">표시는 상위 {compactNumber(visibleCards.length)}장</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1220px] text-left text-sm">
          <thead className="bg-white/[0.03] text-[#c6d0e4]">
            <tr>{["카드", "세트", "희귀도", "타입", "최저가", "최근판매가", "평균가", "PSA 10", "변동률", "신뢰도"].map((head) => <th key={head} className="border-b border-[#243047] px-5 py-4 font-bold">{head}</th>)}</tr>
          </thead>
          <tbody>
            {visibleCards.map((card) => (
              <tr key={card.id} onClick={() => onOpenCard?.(card)} className={cn("border-b border-[#1e2b40]", onOpenCard && "cursor-pointer transition hover:bg-white/[0.035]")}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={(event) => { event.stopPropagation(); onOpenCard?.(card); }} className="h-28 w-20 shrink-0 overflow-hidden rounded-[6px]">
                      <CardArt item={card} tall className="h-full w-full transition hover:border-[#c178ff]" />
                    </button>
                    <div className="min-w-0">
                      <div className="font-bold text-white">{card.name}</div>
                      <div className="text-[#8d9ab0]">{card.publicCode || card.champion}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-[#c5d0e2]">{card.set}</td>
                <td className="px-5 py-3 text-[#f5a84b]">{card.rarity}</td>
                <td className="px-5 py-3 text-[#c5d0e2]">{card.cardType}</td>
                <td className="px-5 py-3 font-bold">{cardLowest(card, currency)}</td>
                <td className="px-5 py-3 font-bold">{cardRecent(card, currency)}</td>
                <td className="px-5 py-3 font-bold">{cardAverage(card, currency)}</td>
                <td className="px-5 py-3 font-bold">{cardGraded(card, currency)}</td>
                <td className="px-5 py-3"><Change value={card.change24hPercent} /></td>
                <td className="px-5 py-3 text-[#7ee787]"><ShieldCheck className="mr-1 inline h-4 w-4" />{card.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CompactCardList({ title = "카드 목록", cards, currency, limit = 12, onOpenCard }: { title?: string; cards: CardItem[]; currency: CurrencyMode; limit?: number; onOpenCard: (card: CardItem) => void }) {
  const visibleCards = cards.slice(0, limit);
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#243047] p-4">
        <h2 className="text-lg font-bold text-[#c6a7ff]">{title} <span className="ml-2 text-sm font-normal text-[#9ca8bc]">{compactNumber(cards.length)}장</span></h2>
        <span className="text-xs text-[#8d9ab0]">상위 {compactNumber(visibleCards.length)}장</span>
      </div>
      <div className="divide-y divide-[#1e2b40]">
        {visibleCards.map((card) => (
          <button key={card.id} type="button" onClick={() => onOpenCard(card)} className="grid w-full grid-cols-[56px_minmax(0,1fr)_120px_80px] items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.035]">
            <CardArt item={card} tall className="h-16 w-12" />
            <div className="min-w-0">
              <div className="truncate font-bold text-white">{card.name}</div>
              <div className="truncate text-xs text-[#8d9ab0]">{card.set} · {card.publicCode || card.champion}</div>
            </div>
            <div className="min-w-0 text-sm">
              <div className="truncate text-[#f5a84b]">{card.rarity}</div>
              <div className="truncate text-[#9faabd]">{card.cardType}</div>
            </div>
            <div className="text-right text-sm">
              <div className="truncate font-bold">{cardAverage(card, currency)}</div>
              <Change value={card.change24hPercent} />
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function CardsView({
  catalog,
  currency,
  filters,
  onFiltersChange,
  onOpenCard,
}: {
  catalog: CatalogPayload;
  currency: CurrencyMode;
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  onOpenCard: (card: CardItem) => void;
}) {
  const filteredCards = useMemo(() => sortCards(filterCards(catalog.cards, filters), filters.sort), [catalog.cards, filters]);
  const signatureCards = sortCards(catalog.cards.filter((card) => card.cardType.includes("Champion")), "average-desc").slice(0, 5);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-4">
        <SidebarFilters cards={catalog.cards} filters={filters} onChange={onFiltersChange} />
      </aside>
      <div className="min-w-0 space-y-4">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[1.2fr_0.9fr]">
          <Panel className="p-5">
            <SectionTitle icon={Flame} title="인기 카드 TOP 5" onAction={() => onFiltersChange({ ...emptyFilters, sort: "average-desc" })} />
            <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-5">
              {filteredCards.slice(0, 5).map((card, index) => (
                <button key={card.id} type="button" onClick={() => onOpenCard(card)} className="text-left">
                  <div className="mb-1 inline-grid h-7 w-7 place-items-center rounded-full bg-[#c98733] text-sm font-bold">{index + 1}</div>
                  <CardArt item={card} tall className="transition hover:border-[#c178ff]" />
                  <div className="mt-2 truncate text-sm font-bold">{card.name}</div>
                  <div className="font-bold">{cardAverage(card, currency)}</div>
                  <Change value={card.change24hPercent} />
                </button>
              ))}
            </div>
          </Panel>
          <Panel className="p-5">
            <SectionTitle icon={Sparkles} title="챔피언 카드" onAction={() => onFiltersChange({ ...emptyFilters, cardType: "Champion", sort: "average-desc" })} />
            <div className="mt-5 grid grid-cols-3 gap-5">
              {signatureCards.slice(0, 3).map((card) => (
                <button key={card.id} type="button" onClick={() => onOpenCard(card)} className="text-left">
                  <CardArt item={card} tall className="transition hover:border-[#c178ff]" />
                </button>
              ))}
            </div>
          </Panel>
        </div>
        <CardTable cards={filteredCards} currency={currency} onOpenCard={onOpenCard} />
      </div>
    </div>
  );
}

function SetsView({
  catalog,
  currency,
  onOpenCard,
  onShowCards,
}: {
  catalog: CatalogPayload;
  currency: CurrencyMode;
  onOpenCard: (card: CardItem) => void;
  onShowCards: (filters?: Partial<FilterState>) => void;
}) {
  const setNames = useMemo(() => uniqueOptions(catalog.cards.map((card) => card.set)), [catalog.cards]);
  const cardsBySet = useMemo(
    () =>
      new Map(
        setNames.map((setName) => [
          setName,
          sortCards(
            catalog.cards.filter((card) => card.set === setName && card.imageUrl),
            "average-desc",
          ),
        ]),
      ),
    [catalog.cards, setNames],
  );
  const productsBySet = useMemo(() => {
    const mapped = new Map<string, SealedProduct>();
    catalog.sealedProducts.filter((product) => product.imageUrl).forEach((product) => {
      const setName = inferredProductSet(product);
      const current = mapped.get(setName);
      if (!current || product.productType === "booster_display") mapped.set(setName, product);
    });
    return mapped;
  }, [catalog.sealedProducts]);
  return (
    <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_430px]">
      <div className="min-w-0 space-y-4">
        <Panel className="relative overflow-hidden p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_45%,rgba(245,184,91,0.34),transparent_22rem)]" />
          <div className="relative grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_220px_280px]">
            <div className="min-w-0">
              <div className="text-sm text-[#b5c0d2]">공식 세트</div>
              <h1 className="mt-2 font-display text-[clamp(2.65rem,13vw,4.5rem)] font-bold leading-none text-[#f4c572]">RIFTBOUND</h1>
              <p className="mt-2 text-2xl font-bold text-[#f5b85b]">{compactNumber(catalog.cards.length)} cards imported</p>
              <p className="mt-5 leading-7 text-[#c7d0df]">공식 카드 갤러리의 세트, 카드 타입, 희귀도, 이미지를 기반으로 구성했습니다.</p>
            </div>
            <div className="min-w-0 rounded-[8px] border border-[#2a3b56] bg-black/30 p-4">
              {[["세트 수", `${setNames.length}개`], ["총 카드 수", `${compactNumber(catalog.cards.length)}장`], ["평균 카드 가치", cardAverage(catalog.cards[0], currency)], ["기준 통화", currency]].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 py-3 text-sm"><span className="truncate text-[#98a5ba]">{k}</span><span className="whitespace-nowrap font-bold">{v}</span></div>
              ))}
            </div>
            <ProductBox product={catalog.sealedProducts[0]} currency={currency} cards={cardsForProduct(catalog.sealedProducts[0], catalog.cards)} />
          </div>
        </Panel>
        <Panel className="p-5">
          <h2 className="text-lg font-bold">세트 둘러보기</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
            {setNames.map((setName, index) => (
              <button key={setName} type="button" onClick={() => onShowCards({ set: setName, sort: "average-desc" })} className={cn("rounded-[8px] border p-4 text-left transition hover:border-[#c178ff]", index === 0 ? "border-[#c178ff] bg-[#51258e]/30" : "border-[#d99538]/60 bg-[#0b1728]")}>
                <div className="grid h-36 place-items-center overflow-hidden rounded-[6px] bg-[radial-gradient(circle_at_50%_28%,rgba(147,51,234,0.34),transparent_70%),#050910]">
                  {(() => {
                    const product = productsBySet.get(setName);
                    const productImage = proxiedImageSrc(product?.imageUrl);
                    const previewCard = cardsBySet.get(setName)?.[0];
                    if (productImage) return <img src={productImage} alt={product?.name || setName} loading="lazy" className="h-full w-full object-contain p-3 drop-shadow-[0_18px_28px_rgba(0,0,0,0.45)]" />;
                    if (previewCard) return <CardArt item={previewCard} tall className="h-32 w-24" />;
                    return <CreditCard className="h-8 w-8 text-[#f8d58a]" />;
                  })()}
                </div>
                <div className="mt-3 text-center font-display text-xl font-bold text-[#f3bd68]">{setName}</div>
                <div className="text-center text-sm text-[#98a5ba]">{catalog.cards.filter((card) => card.set === setName).length}장</div>
              </button>
            ))}
          </div>
          <h2 className="mt-8 text-lg font-bold">카드 미리보기</h2>
          <div className="mt-4 grid grid-cols-3 gap-4 md:grid-cols-8">
            {catalog.cards.slice(0, 32).map((card) => (
              <button key={card.id} type="button" onClick={() => onOpenCard(card)} className="text-left">
                <CardArt item={card} tall className="transition hover:border-[#c178ff]" />
                <div className="mt-2 truncate text-sm font-bold">{card.name}</div>
                <div className="text-[#65e481]">{cardAverage(card, currency)}</div>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <aside className="grid min-w-0 gap-4 xl:grid-cols-2 2xl:block 2xl:space-y-4"><Panel className="p-5"><SectionTitle title="세트 최고 가치 카드" onAction={() => onShowCards({ sort: "average-desc" })} /><Ranking items={sortCards(catalog.cards, "average-desc").slice(0, 5)} currency={currency} onOpenCard={onOpenCard} /></Panel><Panel className="p-5"><SectionTitle icon={LineChart} title="시장 트렌드" action="" /><div className="mt-5 h-52 rounded-[8px] bg-[linear-gradient(180deg,rgba(126,71,255,0.28),transparent),repeating-linear-gradient(to_right,transparent,transparent_38px,rgba(255,255,255,0.04)_39px),repeating-linear-gradient(to_top,transparent,transparent_38px,rgba(255,255,255,0.04)_39px)]" /></Panel></aside>
    </div>
  );
}

function Ranking({ items, currency, onOpenCard }: { items: CardItem[]; currency: CurrencyMode; onOpenCard?: (card: CardItem) => void }) {
  return (
    <div className="mt-4 space-y-3">
      {items.map((card, index) => (
        <button key={card.id} type="button" onClick={() => onOpenCard?.(card)} className="flex w-full items-center gap-3 border-b border-[#1e2b40] pb-3 text-left transition hover:bg-white/[0.03]">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[#c98733] font-bold">{index + 1}</div>
          <div className="h-20 w-14 shrink-0 overflow-hidden rounded-[6px]"><CardArt item={card} tall className="h-full w-full" /></div>
          <div className="min-w-0 flex-1"><div className="truncate font-bold">{card.name}</div><div className="text-xs text-[#8996ad]">{card.publicCode || card.champion}</div></div>
          <div className="text-right"><div className="font-bold">{cardAverage(card, currency)}</div><Change value={card.change24hPercent} /></div>
        </button>
      ))}
    </div>
  );
}

function MarketView({ catalog, currency, onOpenProduct }: { catalog: CatalogPayload; currency: CurrencyMode; onOpenProduct: (product: SealedProduct) => void }) {
  const featuredProduct = catalog.sealedProducts[0];
  const featuredCards = cardsForProduct(featuredProduct, catalog.cards);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel className="p-5">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
              <ProductBox product={featuredProduct} currency={currency} cards={featuredCards} onClick={() => onOpenProduct(featuredProduct)} />
              <div>
                <div className="text-sm text-[#c6a7ff]">추천 상품</div>
                <h1 className="mt-2 text-3xl font-bold">{featuredProduct.name}</h1>
                <p className="text-[#9faabd]">{featuredProduct.nameKo}</p>
                <div className="mt-5 grid gap-4 border-y border-[#243047] py-5 md:grid-cols-4">
                  {[["팩 구성", productComposition(featuredProduct)], ["공식 판매가", usd(featuredProduct.msrpUsd)], ["최저가", productLowest(featuredProduct, currency)], ["평균가", productAverage(featuredProduct, currency)]].map(([k, v]) => <div key={k}><div className="text-sm text-[#9faabd]">{k}</div><div className="mt-1 text-xl font-bold">{v}</div></div>)}
                </div>
                <button type="button" onClick={() => onOpenProduct(featuredProduct)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-[7px] border border-[#9b62ff] bg-[#54259a]/70 px-5 font-bold text-white transition hover:bg-[#6233b5]">
                  상품 정보 보기 <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Panel>
          <Panel className="overflow-hidden"><div className="p-5"><SectionTitle title="미개봉 상품 시세 비교" action="" /></div><ProductTable products={catalog.sealedProducts} currency={currency} onOpenProduct={onOpenProduct} /></Panel>
        </div>
        <aside className="space-y-4">
          <Panel className="p-5">
            <SectionTitle icon={Flame} title="미개봉 상승 TOP 5" action="" />
            <div className="mt-4 space-y-3">
              {catalog.sealedProducts.slice(0, 5).map((product, index) => (
                <button key={product.id} type="button" onClick={() => onOpenProduct(product)} className="flex w-full justify-between gap-3 border-b border-[#1e2b40] pb-3 text-left transition hover:text-white">
                  <span className="truncate">{index + 1}. {product.name}</span>
                  <Change value={product.change24hPercent} />
                </button>
              ))}
            </div>
          </Panel>
          <Panel className="p-5"><SectionTitle icon={Clock3} title="마지막 업데이트" action="" /><p className="mt-4 text-[#c7d0df]">{formatKstDateTime(catalog.updatedAt)}</p></Panel>
        </aside>
      </div>
  );
}

function ProductTable({ products, currency, onOpenProduct }: { products: SealedProduct[]; currency: CurrencyMode; onOpenProduct?: (product: SealedProduct) => void }) {
  const heads = ["상품", "세트", "구성", "최저가", "최근판매가", "평균가", "7일 변동률", "시장 판단"];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1060px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[250px]" />
          <col className="w-[115px]" />
          <col className="w-[105px]" />
          <col className="w-[115px]" />
          <col className="w-[125px]" />
          <col className="w-[115px]" />
          <col className="w-[125px]" />
          <col className="w-[110px]" />
        </colgroup>
        <thead className="bg-white/[0.03]">
          <tr>
            {heads.map((head) => <th key={head} className="whitespace-nowrap border-y border-[#243047] px-5 py-3 align-middle">{head}</th>)}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} onClick={() => onOpenProduct?.(product)} className={cn("border-b border-[#1e2b40]", onOpenProduct && "cursor-pointer transition hover:bg-white/[0.03]")}>
              <td className="px-5 py-4 font-bold">
                <div className="truncate">{product.name}</div>
                <div className="truncate text-xs font-normal text-[#8d9ab0]">{product.nameKo}</div>
              </td>
              <td className="whitespace-nowrap px-5 py-4">{product.set}</td>
              <td className="whitespace-nowrap px-5 py-4">{product.packCount ? `${product.packCount}팩` : "덱 구성"}</td>
              <td className="whitespace-nowrap px-5 py-4 font-bold tabular-nums">{productLowest(product, currency)}</td>
              <td className="whitespace-nowrap px-5 py-4 font-bold tabular-nums">{productRecent(product, currency)}</td>
              <td className="whitespace-nowrap px-5 py-4 font-bold tabular-nums">{productAverage(product, currency)}</td>
              <td className="whitespace-nowrap px-5 py-4"><Change value={product.change24hPercent} /></td>
              <td className="whitespace-nowrap px-5 py-4"><span className="inline-flex h-8 min-w-14 items-center justify-center rounded-[6px] border border-[#7e57ff] px-3 text-sm font-bold text-[#d9c2ff]">관망</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChampionsView({ catalog, currency, onOpenCard }: { catalog: CatalogPayload; currency: CurrencyMode; onOpenCard: (card: CardItem) => void }) {
  const [filters, setFilters] = useState<FilterState>({ ...emptyFilters, cardType: "Champion" });
  const filteredCards = sortCards(dedupeCardsByIdentity(filterCards(catalog.cards, filters)), "average-desc");
  const selected = filteredCards[0] || catalog.cards[0];
  const allChampionEntries = topChampionEntries(catalog.cards);
  const championEntries = allChampionEntries.slice(0, 12);
  const resultTitle = championResultTitle(filters);

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Panel className="p-5">
          <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-[#c6a7ff]">챔피언 둘러보기 <span className="ml-4 text-[#8c98ae]">TOP {championEntries.length} / {allChampionEntries.length}</span></h2><Search className="h-5 w-5" /></div>
          <div className="mt-5 grid grid-cols-3 gap-3 md:grid-cols-6">{championEntries.map(({ champion, bestCard }) => {
            return <button key={champion} type="button" onClick={() => setFilters({ ...emptyFilters, champion, sort: "average-desc" })} className="text-left"><CardArt item={bestCard} tall className="mx-auto h-44 w-32" /><div className="mt-2 truncate text-center font-bold">{champion}</div><div className="truncate text-center text-sm text-[#f5b85b]">{cardMarketPrice(bestCard, currency)}</div></button>;
          })}</div>
        </Panel>
        <Panel className="p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_170px]">
            <SearchInput value={filters.query} onChange={(value) => setFilters({ ...filters, query: value })} />
            <SelectField label="세트" value={filters.set} options={uniqueOptions(catalog.cards.map((card) => card.set))} onChange={(value) => setFilters({ ...filters, set: value })} />
            <SelectField label="희귀도" value={filters.rarity} options={uniqueOptions(catalog.cards.map((card) => card.rarity))} onChange={(value) => setFilters({ ...filters, rarity: value })} />
            <label className="block"><span className="text-sm text-[#c6d0e4]">정렬</span><select value="average-desc" onChange={() => undefined} className="mt-2 h-11 w-full rounded-[6px] border border-[#2a3b56] bg-[#0b1728] px-3 text-[#d7e0ef]"><option value="average-desc">가격 높은순 고정</option></select></label>
          </div>
        </Panel>
        <CompactCardList title={resultTitle} cards={filteredCards} currency={currency} limit={filteredCards.length} onOpenCard={onOpenCard} />
      </div>
      <aside className="space-y-4"><Panel className="p-5"><SectionTitle title="특정 챔피언" action="" /><button type="button" onClick={() => onOpenCard(selected)} className="mt-4 block text-left"><CardArt item={selected} tall className="h-72 w-52 transition hover:border-[#c178ff]" /></button><h1 className="mt-4 text-3xl font-bold">{selected.champion}</h1><p className="text-[#9faabd]">{selected.name}</p><dl className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-[7px] border border-[#243047] p-3"><dt className="text-sm text-[#8d9ab0]">검색 결과</dt><dd className="text-xl font-bold">{filteredCards.length}장</dd></div><div className="rounded-[7px] border border-[#243047] p-3"><dt className="text-sm text-[#8d9ab0]">대표 가격</dt><dd className="truncate text-xl font-bold">{cardAverage(selected, currency)}</dd></div></dl></Panel><Panel className="p-5"><SectionTitle title="인기 챔피언 랭킹" action="" /><Ranking items={filteredCards.slice(0, 4)} currency={currency} onOpenCard={onOpenCard} /></Panel></aside>
    </div>
  );
}

function CalculatorView({ catalog, currency }: { catalog: CatalogPayload; currency: CurrencyMode }) {
  const [priceValue, setPriceValue] = useState(250000);
  const [shipping, setShipping] = useState(25000);
  const [extraCost, setExtraCost] = useState(19800);
  const [feeRate, setFeeRate] = useState(5);
  const [sell, setSell] = useState(560000);
  const presetCards = useMemo(() => sortCards(catalog.cards.filter((card) => card.imageUrl), "average-desc").slice(0, 6), [catalog.cards]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const exchangeRate = useMemo(() => inferExchangeRate(catalog.cards), [catalog.cards]);
  const selectedPreset = presetCards.find((card) => card.id === selectedPresetId) || presetCards[0];
  const saleFee = Math.round(sell * (feeRate / 100));
  const total = priceValue + shipping + extraCost;
  const settlement = sell - saleFee;
  const profit = settlement - total;
  const roi = total > 0 ? Math.round((profit / total) * 1000) / 10 : 0;
  const breakEven = feeRate >= 100 ? 0 : Math.ceil(total / (1 - feeRate / 100));
  const resultTone = profit >= 0 ? "text-[#51e879]" : "text-[#ff5757]";
  const applyPreset = (card: CardItem) => {
    setSelectedPresetId(card.id);
    setSell(card.averagePriceKrw || card.recentSoldPriceKrw || card.lowestPriceKrw || sell);
  };
  const moneyFields: Array<[string, number, (value: number) => void, string]> = [
    ["구매가", priceValue, setPriceValue, "카드 또는 상품을 사는 가격"],
    ["배송/관세", shipping, setShipping, "해외 배송비, 관세, 부가세 합산"],
    ["기타 비용", extraCost, setExtraCost, "등급비, 포장재, 국내 배송비 등"],
    ["예상 판매가", sell, setSell, "실제로 팔 수 있을 것 같은 가격"],
  ];

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Panel className="p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div><h1 className="text-2xl font-bold text-[#c6a7ff]">리셀 & 수익 계산기</h1><p className="mt-2 text-[#a8b3c8]">카드를 얼마에 사서 얼마에 팔아야 하는지 빠르게 판단합니다.</p></div>
            <div className="rounded-[7px] border border-[#263752] bg-black/20 px-3 py-2 text-sm text-[#9faabd]">기준 환율: 1 USD = {won(exchangeRate)}</div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{presetCards.map((card, index) => <button key={card.id} type="button" onClick={() => applyPreset(card)} className={cn("min-w-0 rounded-[8px] border bg-[#081525] p-2 text-left transition hover:border-[#c178ff] hover:bg-[#101d30]", selectedPresetId === card.id || (!selectedPresetId && index === 0) ? "border-[#c178ff] bg-[#51258e]/25" : "border-[#33465f]")}><CardArt item={card} tall className="mx-auto h-32 w-24" /><div className="mt-3 truncate text-sm font-bold text-white">{card.champion}</div><div className="truncate text-xs text-[#91a0b6]">{card.name}</div><div className="mt-2 truncate text-sm font-bold text-[#f5b85b]">{cardAverage(card, currency)}</div></button>)}</div>
        </Panel>
        <Panel className="p-5">
          <SectionTitle title="비용 입력" action="" />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {moneyFields.map(([label, value, setter, helper]) => (
              <label key={label} className="block rounded-[8px] border border-[#243047] bg-[#0b1728] p-4">
                <span className="flex items-center justify-between gap-3 text-sm text-[#c6d0e4]"><span>{label}</span><span className="text-xs text-[#8d9ab0]">{helper}</span></span>
                <div className="mt-3 flex h-11 items-center rounded-[6px] border border-[#2a3b56] bg-[#071324] px-3">
                  <span className="text-[#f5b85b]">{currency}</span>
                  <input className="min-w-0 flex-1 bg-transparent px-3 text-right font-bold text-[#d7e0ef] outline-none" value={displayCurrencyValue(currency, value, exchangeRate)} onChange={(event) => setter(parseCurrencyValue(currency, Number(event.target.value) || 0, exchangeRate))} />
                </div>
              </label>
            ))}
            <label className="block rounded-[8px] border border-[#243047] bg-[#0b1728] p-4">
              <span className="flex items-center justify-between gap-3 text-sm text-[#c6d0e4]"><span>판매 수수료</span><span className="text-xs text-[#8d9ab0]">플랫폼/결제 수수료율</span></span>
              <div className="mt-3 flex h-11 items-center rounded-[6px] border border-[#2a3b56] bg-[#071324] px-3">
                <input className="min-w-0 flex-1 bg-transparent px-3 text-right font-bold text-[#d7e0ef] outline-none" value={feeRate} onChange={(event) => setFeeRate(Math.max(0, Number(event.target.value) || 0))} />
                <span className="text-[#f5b85b]">%</span>
              </div>
            </label>
          </div>
        </Panel>
      </div>
      <aside className="space-y-4">
        <Panel className="p-5"><SectionTitle title="계산 결과" action="" /><div className="mt-5 space-y-3">{[["총 원가", formatMoney(currency, total, exchangeRate), "구매가 + 배송/관세 + 기타 비용"], ["정산 예상액", formatMoney(currency, settlement, exchangeRate), "예상 판매가 - 판매 수수료"], ["예상 손익", formatMoney(currency, profit, exchangeRate), `${profit >= 0 ? "수익" : "손실"} 구간`], ["손익분기 판매가", formatMoney(currency, breakEven, exchangeRate), "이 가격 이상부터 수익"]].map(([label, value, sub]) => <div key={label} className="rounded-[8px] border border-[#243047] bg-[#0b1728] p-4"><div className="text-sm text-[#a8b3c8]">{label}</div><div className={cn("mt-2 break-words text-[clamp(1.25rem,1.6vw,2rem)] font-bold leading-tight tabular-nums", label === "예상 손익" && resultTone)}>{value}</div><div className="mt-1 text-xs text-[#8d9ab0]">{sub}</div></div>)}</div><div className="mt-4 rounded-[8px] border border-[#263752] bg-black/20 p-4 text-center"><div className="text-sm text-[#9faabd]">ROI</div><div className={cn("mt-1 text-3xl font-bold", resultTone)}>{roi}%</div></div></Panel>
        <Panel className="p-5"><SectionTitle title="판단 가이드" action="" /><div className="mt-4 space-y-3 text-sm text-[#c7d0df]"><p><span className="font-bold text-[#f5b85b]">매수 기준:</span> 현재 판매가가 손익분기보다 충분히 높을 때만 진입하세요.</p><p><span className="font-bold text-[#f5b85b]">보수 기준:</span> 고가 카드는 수수료와 배송비를 넉넉하게 잡는 편이 안전합니다.</p>{selectedPreset ? <p><span className="font-bold text-[#f5b85b]">선택 카드:</span> {selectedPreset.champion} · {selectedPreset.name}</p> : null}</div></Panel>
      </aside>
    </div>
  );
}

function FavoriteCollectionView({
  catalog,
  currency,
  favoriteCards,
  onOpenCard,
}: {
  catalog: CatalogPayload;
  currency: CurrencyMode;
  favoriteCards: CardItem[];
  onOpenCard: (card: CardItem) => void;
}) {
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const filteredCards = sortCards(filterCards(favoriteCards, filters), filters.sort);
  const exchangeRate = inferExchangeRate(catalog.cards);
  const totalValueKrw = favoriteCards.reduce((sum, card) => sum + cardPriceValue(card), 0);
  const topFavorite = sortCards(favoriteCards, "average-desc")[0];
  const recentCards = favoriteCards.length ? favoriteCards.slice(0, 6) : sortCards(catalog.cards.filter((card) => card.imageUrl), "average-desc").slice(0, 6);
  const displayValue = currency === "KRW" ? won(totalValueKrw) : usd(Math.round((totalValueKrw / exchangeRate) * 100) / 100);

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
      <SidebarFilters title="컬렉션 필터" cards={favoriteCards.length ? favoriteCards : catalog.cards} filters={filters} onChange={setFilters} />
      <div className="min-w-0 space-y-4">
        <Panel className="p-5">
          <SectionTitle title="관심 카드 요약" action="" />
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              ["관심 카드 가치", favoriteCards.length ? displayValue : "-", "관심 등록 카드 기준"],
              ["관심 카드 수", compactNumber(favoriteCards.length) + "장", "카드 상세에서 추가"],
              ["최고 관심 카드", topFavorite?.name || "-", topFavorite ? cardMarketPrice(topFavorite, currency) : "등록 전"],
              ["공식 카드 DB", compactNumber(catalog.cards.length) + "장", "전체 탐색 가능"],
            ].map(([title, value, sub]) => (
              <div key={title} className="rounded-[8px] border border-[#243047] bg-[#0b1728] p-4">
                <div className="text-sm text-[#a8b3c8]">{title}</div>
                <div className="mt-4 truncate text-2xl font-bold">{value}</div>
                <div className="mt-2 text-sm text-[#51e879]">{sub}</div>
              </div>
            ))}
          </div>
        </Panel>
        {favoriteCards.length ? (
          <CompactCardList title="관심 카드" cards={filteredCards} currency={currency} limit={10} onOpenCard={onOpenCard} />
        ) : (
          <Panel className="p-8 text-center">
            <Bookmark className="mx-auto h-10 w-10 text-[#b994ff]" />
            <h2 className="mt-4 text-2xl font-bold text-white">아직 관심 카드가 없습니다</h2>
            <p className="mx-auto mt-2 max-w-lg text-[#9faabd]">카드 상세 화면에서 관심 카드 추가를 누르면 이 화면에서 모아볼 수 있습니다.</p>
          </Panel>
        )}
      </div>
      <aside className="min-w-0 space-y-4">
        <Panel className="p-5">
          <SectionTitle title="관심 구성" action="" />
          <div className="mx-auto mt-6 grid h-52 w-52 place-items-center rounded-full bg-[conic-gradient(#f5c542_0_29%,#5cc7b8_29%_50%,#3b82f6_50%_66%,#7c3aed_66%_84%,#1e293b_84%)]">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-[#081525] text-center text-sm font-bold">총 가치<br />{favoriteCards.length ? displayValue : "-"}</div>
          </div>
        </Panel>
        <Panel className="p-5">
          <SectionTitle title={favoriteCards.length ? "최근 관심 카드" : "추천 관심 카드"} action="" />
          <div className="mt-4 grid grid-cols-3 gap-3">
            {recentCards.map((card) => (
              <button key={card.id} type="button" onClick={() => onOpenCard(card)} className="text-left">
                <CardArt item={card} tall className="h-24 w-16 transition hover:border-[#c178ff]" />
              </button>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

type CommunityPost = {
  id: string;
  category: string;
  title: string;
  body: string;
  author: string;
  authorId?: string;
  level: number;
  views: number;
  likes: number;
  comments: number;
  createdAt: string;
  cardId?: string | null;
  card?: CardItem;
  isRemote?: boolean;
};

type CommunityComment = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
};

type CommunityPostRow = {
  id: string;
  category: string;
  title: string;
  body: string;
  author_id: string;
  card_id: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  created_at: string;
  profiles?: { display_name?: string | null } | { display_name?: string | null }[] | null;
};

type CommunityCommentRow = {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  profiles?: { display_name?: string | null } | { display_name?: string | null }[] | null;
};

function readJoinedProfileName(value: CommunityPostRow["profiles"] | CommunityCommentRow["profiles"], fallback = "Riftbound 회원") {
  if (Array.isArray(value)) return value[0]?.display_name || fallback;
  return value?.display_name || fallback;
}

function relativeKstTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return value;
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}시간 전`;
  return `${Math.floor(diffMinutes / 1440)}일 전`;
}

function CommunityView({ catalog, currency, currentUser, onRequireAuth }: { catalog: CatalogPayload; currency: CurrencyMode; currentUser: AuthUser | null; onRequireAuth: () => void }) {
  const categories = ["전체", "시세 제보", "개봉 후기", "등급 후기", "거래 후기", "질문", "자유 게시판"];
  const communityCards = useMemo(() => sortCards(catalog.cards.filter((card) => card.imageUrl), "average-desc").slice(0, 18), [catalog.cards]);
  const seedPosts = useMemo<CommunityPost[]>(
    () => [
      { id: "market-ahri", category: "시세 제보", title: "아리 쇼케이스 가격이 다시 움직입니다", body: "PriceCharting 기준 최고가권 카드가 유지되고 있습니다. 관심 등록 후 변동률을 같이 봐야 할 구간입니다.", author: "카드헌터77", level: 76, views: 3842, likes: 128, comments: 76, createdAt: "3시간 전", card: communityCards[0] },
      { id: "open-night", category: "개봉 후기", title: "Origins 디스플레이 개봉 결과 공유", body: "고가 카드보다 세트 완성도가 좋아서 컬렉션용 만족도가 높았습니다. 박스 상태도 중요해 보입니다.", author: "빛나는카드", level: 52, views: 1256, likes: 64, comments: 22, createdAt: "1시간 전", card: communityCards[1] },
      { id: "grade-psa", category: "등급 후기", title: "PSA 10 노릴 때 확인한 포인트", body: "상단 모서리와 후면 센터링이 가장 크게 갈렸습니다. 슬리브 넣기 전 사진 기록을 남겨두는 게 좋았습니다.", author: "붉은창기사", level: 68, views: 987, likes: 45, comments: 18, createdAt: "2시간 전", card: communityCards[2] },
      { id: "safe-trade", category: "거래 후기", title: "첫 고가 거래 성공했습니다", body: "직거래 전 실물 사진, 시간 인증, 카드 번호 확인까지 체크하고 진행했습니다.", author: "티모는귀여워", level: 33, views: 523, likes: 32, comments: 9, createdAt: "3시간 전", card: communityCards[3] },
      { id: "storage", category: "질문", title: "고가 카드 보관은 어떤 방식이 좋을까요?", body: "마그네틱 케이스와 탑로더 중 장기 보관 기준으로 추천 부탁드립니다.", author: "마법공학수집가", level: 41, views: 712, likes: 15, comments: 33, createdAt: "4시간 전", card: communityCards[4] },
    ],
    [communityCards],
  );
  const [activeCategory, setActiveCategory] = useState("전체");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("popular");
  const [userPosts, setUserPosts] = useState<CommunityPost[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftCategory, setDraftCategory] = useState("시세 제보");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftCardId, setDraftCardId] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommunityComment[]>>({});
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseAuthConfigured()) return;

    const supabase = getSupabaseBrowserClient();
    const cardById = new Map(catalog.cards.map((card) => [card.id, card]));
    let ignore = false;

    async function loadCommunity() {
      setCommunityLoading(true);
      const [postsResult, commentsResult] = await Promise.all([
        supabase
          .from("community_posts")
          .select("id, category, title, body, author_id, card_id, view_count, like_count, comment_count, created_at, profiles(display_name)")
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("community_comments")
          .select("id, post_id, body, created_at, profiles(display_name)")
          .eq("is_deleted", false)
          .order("created_at", { ascending: true })
          .limit(240),
      ]);

      if (ignore) return;

      if (postsResult.error) {
        setCommunityError("커뮤니티 DB를 아직 불러오지 못했습니다. Supabase 마이그레이션 적용 후 자동으로 연결됩니다.");
        setCommunityLoading(false);
        return;
      }

      const remotePosts = ((postsResult.data || []) as unknown as CommunityPostRow[]).map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        body: row.body,
        author: readJoinedProfileName(row.profiles),
        authorId: row.author_id,
        level: 1,
        views: row.view_count || 0,
        likes: row.like_count || 0,
        comments: row.comment_count || 0,
        createdAt: relativeKstTime(row.created_at),
        cardId: row.card_id,
        card: row.card_id ? cardById.get(row.card_id) : undefined,
        isRemote: true,
      }));

      setUserPosts(remotePosts);

      if (!commentsResult.error) {
        const grouped = ((commentsResult.data || []) as unknown as CommunityCommentRow[]).reduce<Record<string, CommunityComment[]>>((acc, row) => {
          acc[row.post_id] = [
            ...(acc[row.post_id] || []),
            {
              id: row.id,
              body: row.body,
              author: readJoinedProfileName(row.profiles),
              createdAt: relativeKstTime(row.created_at),
            },
          ];
          return acc;
        }, {});
        setCommentsByPost(grouped);
      }

      setCommunityError(null);
      setCommunityLoading(false);
    }

    void loadCommunity();
    return () => {
      ignore = true;
    };
  }, [catalog.cards]);

  const posts = useMemo(() => [...userPosts, ...seedPosts], [seedPosts, userPosts]);
  const visiblePosts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const next = posts.filter((post) => {
      const matchesCategory = activeCategory === "전체" || post.category === activeCategory;
      const matchesQuery = !needle || [post.title, post.body, post.author, post.card?.name, post.card?.champion].filter(Boolean).join(" ").toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
    return [...next].sort((left, right) => {
      if (sort === "latest") return right.id.localeCompare(left.id);
      if (sort === "comments") return right.comments + (commentsByPost[right.id]?.length || 0) - (left.comments + (commentsByPost[left.id]?.length || 0));
      return right.views + right.likes * 12 - (left.views + left.likes * 12);
    });
  }, [activeCategory, commentsByPost, posts, query, sort]);
  const selectedPost = posts.find((post) => post.id === selectedPostId) || visiblePosts[0] || posts[0];
  const topPosts = [...posts].sort((left, right) => right.views - left.views).slice(0, 5);
  const toggleSet = (setter: (value: Set<string>) => void, current: Set<string>, id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const ensureProfile = async () => {
    if (!currentUser || !isSupabaseAuthConfigured()) return null;
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("profiles").upsert(
      {
        id: currentUser.id,
        display_name: currentUser.name,
        avatar_url: currentUser.avatarUrl || null,
        provider: currentUser.provider || "oauth",
      },
      { onConflict: "id" },
    );
    if (error) throw error;
    return supabase;
  };

  const submitPost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!draftTitle.trim() || !draftBody.trim()) return;
    const linkedCard = catalog.cards.find((card) => card.id === draftCardId) || communityCards[0];
    const nextPost: CommunityPost = {
      id: `user-${Date.now()}`,
      category: draftCategory,
      title: draftTitle.trim(),
      body: draftBody.trim(),
      author: currentUser.name,
      authorId: currentUser.id,
      level: 1,
      views: 0,
      likes: 0,
      comments: 0,
      createdAt: "방금 전",
      cardId: linkedCard?.id,
      card: linkedCard,
    };

    if (isSupabaseAuthConfigured()) {
      try {
        const supabase = await ensureProfile();
        const { data, error } = await supabase!
          .from("community_posts")
          .insert({
            author_id: currentUser.id,
            body: nextPost.body,
            card_id: linkedCard?.id || null,
            category: nextPost.category,
            title: nextPost.title,
          })
          .select("id, created_at")
          .single();

        if (error) throw error;
        nextPost.id = String(data.id);
        nextPost.createdAt = relativeKstTime(String(data.created_at));
        nextPost.isRemote = true;
        setCommunityError(null);
      } catch (error) {
        setCommunityError(error instanceof Error ? error.message : "게시글 저장에 실패했습니다.");
        return;
      }
    }

    setUserPosts((current) => [nextPost, ...current]);
    setSelectedPostId(nextPost.id);
    setDraftTitle("");
    setDraftBody("");
    setDraftCardId("");
    setComposerOpen(false);
  };
  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!selectedPost || !commentDraft.trim()) return;
    const nextComment: CommunityComment = {
      id: `comment-${Date.now()}`,
      author: currentUser.name,
      body: commentDraft.trim(),
      createdAt: "방금 전",
    };

    if (selectedPost.isRemote && isSupabaseAuthConfigured()) {
      try {
        const supabase = await ensureProfile();
        const { data, error } = await supabase!
          .from("community_comments")
          .insert({
            author_id: currentUser.id,
            body: nextComment.body,
            post_id: selectedPost.id,
          })
          .select("id, created_at")
          .single();

        if (error) throw error;
        nextComment.id = String(data.id);
        nextComment.createdAt = relativeKstTime(String(data.created_at));
        setCommunityError(null);
      } catch (error) {
        setCommunityError(error instanceof Error ? error.message : "댓글 저장에 실패했습니다.");
        return;
      }
    }

    setCommentsByPost((current) => ({ ...current, [selectedPost.id]: [...(current[selectedPost.id] || []), nextComment] }));
    setCommentDraft("");
  };

  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden p-0">
        <div className="flex flex-col gap-5 bg-[radial-gradient(circle_at_66%_30%,rgba(168,85,247,0.35),transparent_22rem),linear-gradient(90deg,#18143a,#061221)] p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Riftbound 커뮤니티</h1>
            <p className="mt-3 text-[#c7d0df]">시세 제보, 개봉 후기, 거래 경험을 모아 빠르게 확인합니다.</p>
          </div>
          <button type="button" onClick={() => currentUser ? setComposerOpen((value) => !value) : onRequireAuth()} className="inline-flex h-12 items-center justify-center gap-2 rounded-[7px] bg-[#6233b5] px-5 font-bold text-white">
            <Plus className="h-4 w-4" /> {currentUser ? "글쓰기" : "가입 후 글쓰기"}
          </button>
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-[1fr_430px]">
        <Panel className="overflow-hidden">
          <div className="scrollbar-none flex gap-3 overflow-x-auto border-b border-[#243047] px-6 pt-5 text-[#aeb9ca]">
            {categories.map((item) => (
              <button key={item} type="button" onClick={() => setActiveCategory(item)} className={cn("shrink-0 border-b-2 px-2 pb-4", activeCategory === item ? "border-[#c178ff] text-[#c6a7ff]" : "border-transparent")}>{item}</button>
            ))}
          </div>
          <div className="grid gap-3 border-b border-[#243047] p-5 md:grid-cols-[1fr_180px]">
            <SearchInput value={query} onChange={setQuery} placeholder="게시글, 카드명, 작성자 검색..." />
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 rounded-[6px] border border-[#2a3b56] bg-[#0b1728] px-3 text-[#d7e0ef]">
              <option value="popular">인기순</option>
              <option value="latest">최신순</option>
              <option value="comments">댓글 많은순</option>
            </select>
          </div>
          {communityLoading || communityError ? (
            <div className={cn("border-b border-[#243047] px-5 py-3 text-sm", communityError ? "bg-[#2a0910] text-[#ffb8c2]" : "bg-[#0b1728] text-[#9faabd]")}>
              {communityError || "커뮤니티 데이터를 불러오는 중입니다."}
            </div>
          ) : null}
          {composerOpen && currentUser ? (
            <form onSubmit={submitPost} className="grid gap-3 border-b border-[#243047] bg-[#0b1728]/70 p-5">
              <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                <select value={draftCategory} onChange={(event) => setDraftCategory(event.target.value)} className="h-11 rounded-[6px] border border-[#2a3b56] bg-[#071324] px-3 text-[#d7e0ef]">
                  {categories.slice(1).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="제목" className="h-11 rounded-[6px] border border-[#2a3b56] bg-[#071324] px-3 text-[#d7e0ef] outline-none" />
              </div>
              <select value={draftCardId} onChange={(event) => setDraftCardId(event.target.value)} className="h-11 rounded-[6px] border border-[#2a3b56] bg-[#071324] px-3 text-[#d7e0ef]">
                <option value="">대표 카드 자동 선택</option>
                {communityCards.map((card) => (
                  <option key={card.id} value={card.id}>{card.champion} · {card.name}</option>
                ))}
              </select>
              <textarea value={draftBody} onChange={(event) => setDraftBody(event.target.value)} placeholder="내용" className="min-h-28 rounded-[6px] border border-[#2a3b56] bg-[#071324] p-3 text-[#d7e0ef] outline-none" />
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setComposerOpen(false)} className="rounded-[6px] border border-[#33465f] px-4 py-2 text-[#c7d0df]">취소</button><button type="submit" className="rounded-[6px] bg-[#6233b5] px-4 py-2 font-bold text-white">등록</button></div>
            </form>
          ) : null}
          <div className="p-5">
            <SectionTitle icon={Flame} title="게시글" action="" />
            <div className="mt-5 divide-y divide-[#1e2b40]">
              {visiblePosts.map((post) => (
                <button key={post.id} type="button" onClick={() => setSelectedPostId(post.id)} className={cn("grid w-full gap-4 py-5 text-left transition hover:bg-white/[0.03] md:grid-cols-[92px_1fr_190px]", selectedPost?.id === post.id && "bg-white/[0.035]")}>
                  <div className="hidden md:block">{post.card ? <CardArt item={post.card} tall className="h-28 w-20" /> : <div className="h-28 w-20 rounded-[7px] border border-[#33465f] bg-[#0b1728]" />}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-[#7d3fc0] px-2 py-1 text-xs font-bold">{post.category}</span><span className="text-xs text-[#8d9ab0]">{post.author} · Lv.{post.level} · {post.createdAt}</span></div>
                    <div className="mt-2 truncate text-lg font-bold text-white">{post.title}</div>
                    <p className="mt-1 line-clamp-2 text-sm text-[#a8b3c8]">{post.body}</p>
                  </div>
                  <div className="flex items-center justify-end gap-4 text-sm text-[#9faabd] md:flex-col md:items-end md:justify-center">
                    <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" /> {compactNumber(post.views)}</span>
                    <span className="inline-flex items-center gap-1"><ThumbsUp className="h-4 w-4" /> {post.likes + (likedIds.has(post.id) ? 1 : 0)}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-4 w-4" /> {post.comments + (commentsByPost[post.id]?.length || 0)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Panel>
        <aside className="space-y-4">
          {selectedPost ? (
            <Panel className="p-5">
              <div className="grid gap-4 md:grid-cols-[120px_1fr] xl:grid-cols-1">
                {selectedPost.card ? <CardArt item={selectedPost.card} tall className="h-44 w-32" /> : null}
                <div>
                  <span className="rounded bg-[#7d3fc0] px-2 py-1 text-xs font-bold">{selectedPost.category}</span>
                  <h2 className="mt-3 text-xl font-bold text-white">{selectedPost.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-[#c7d0df]">{selectedPost.body}</p>
                  {selectedPost.card ? <div className="mt-4 rounded-[7px] border border-[#243047] bg-black/20 p-3 text-sm"><div className="text-[#9faabd]">{selectedPost.card.champion} · {selectedPost.card.name}</div><div className="mt-1 font-bold text-[#f5b85b]">{cardAverage(selectedPost.card, currency)}</div></div> : null}
                </div>
              </div>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => toggleSet(setLikedIds, likedIds, selectedPost.id)} className={cn("flex h-10 flex-1 items-center justify-center gap-2 rounded-[6px] border", likedIds.has(selectedPost.id) ? "border-[#c178ff] bg-[#51258e]/40 text-white" : "border-[#33465f] text-[#c7d0df]")}><ThumbsUp className="h-4 w-4" /> 좋아요</button>
                <button type="button" onClick={() => toggleSet(setBookmarkedIds, bookmarkedIds, selectedPost.id)} className={cn("flex h-10 flex-1 items-center justify-center gap-2 rounded-[6px] border", bookmarkedIds.has(selectedPost.id) ? "border-[#f5b85b] bg-[#4b2d12]/50 text-white" : "border-[#33465f] text-[#c7d0df]")}><Bookmark className="h-4 w-4" /> 저장</button>
              </div>
              <form onSubmit={submitComment} className="mt-5 flex gap-2">
                <input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} onFocus={() => { if (!currentUser) onRequireAuth(); }} disabled={!currentUser} placeholder={currentUser ? "댓글 입력" : "회원가입 후 댓글 입력"} className="h-10 min-w-0 flex-1 rounded-[6px] border border-[#2a3b56] bg-[#071324] px-3 text-sm text-[#d7e0ef] outline-none disabled:opacity-60" />
                <button type="submit" className="grid h-10 w-10 place-items-center rounded-[6px] bg-[#6233b5]"><Send className="h-4 w-4" /></button>
              </form>
              <div className="mt-4 space-y-2 text-sm text-[#c7d0df]">
                {(commentsByPost[selectedPost.id] || []).map((comment) => (
                  <div key={comment.id} className="rounded-[6px] border border-[#243047] bg-black/20 p-3">
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs text-[#8d9ab0]"><span>{comment.author}</span><span>{comment.createdAt}</span></div>
                    <div>{comment.body}</div>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
          <Panel className="p-5"><SectionTitle icon={Flame} title="인기 토픽" action="" /><div className="mt-4 space-y-3">{topPosts.map((post, index) => <button key={post.id} type="button" onClick={() => setSelectedPostId(post.id)} className="flex w-full justify-between gap-3 text-left text-sm"><span className="min-w-0 truncate">{index + 1}. {post.title}</span><span className="shrink-0 text-[#8d9ab0]">{compactNumber(post.views)}</span></button>)}</div></Panel>
          <Panel className="p-5"><SectionTitle title="커뮤니티 현황" action="" /><div className="mt-4 grid grid-cols-2 gap-3 text-center text-sm">{[["총 게시글", posts.length], ["댓글", posts.reduce((sum, post) => sum + post.comments, 0) + Object.values(commentsByPost).flat().length], ["저장한 글", bookmarkedIds.size], ["활성 카테고리", categories.length - 1]].map(([label, value]) => <div key={String(label)} className="rounded-[7px] border border-[#243047] bg-[#0b1728] p-3"><div className="text-[#8d9ab0]">{label}</div><div className="mt-1 text-xl font-bold text-white">{value}</div></div>)}</div></Panel>
        </aside>
      </div>
    </div>
  );
}

function GuidesView() {
  const guideCategories: Array<[string, string, string[]]> = [
    ["입문", "카드 번호, 세트, 희귀도, 챔피언 카드를 먼저 이해합니다.", ["세트 코드 확인", "카드 타입 구분", "챔피언/유닛/룬 차이"]],
    ["시세", "최저가, 최근판매가, 평균가를 함께 보고 과열을 피합니다.", ["최근판매가 우선", "소스 2개 이상 비교", "환율 기준 확인"]],
    ["리셀", "구매 총원가와 판매 수수료를 먼저 계산한 뒤 진입합니다.", ["손익분기 계산", "배송/관세 포함", "판매 채널별 수수료"]],
    ["안전 거래", "고가 카드는 실물 인증과 거래 기록을 남기는 방식이 핵심입니다.", ["시간 인증 사진", "상태 상세컷", "추적 가능한 배송"]],
  ];
  const quickGuides: Array<[string, string, string]> = [
    ["처음 시작", "Riftbound 계정, 세트, 카드 검색 흐름을 익히는 기본 가이드", "6분"],
    ["카드 등급", "Raw, PSA, BGS, CGC 가격 차이를 읽는 법", "8분"],
    ["시세 읽기", "최저가와 최근판매가가 다를 때 판단하는 기준", "7분"],
    ["보관", "슬리브, 탑로더, 마그네틱 케이스 선택 기준", "5분"],
    ["거래 체크리스트", "고가 카드 거래 전 확인해야 할 필수 항목", "6분"],
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_430px]">
      <div className="space-y-4"><Panel className="p-10"><h1 className="text-4xl font-bold">Riftbound 가이드</h1><p className="mt-4 max-w-3xl text-xl leading-8 text-[#c7d0df]">카드 검색부터 가격 판단, 리셀 계산, 안전 거래까지 처음 온 유저가 바로 따라갈 수 있게 정리했습니다.</p><div className="mt-6 grid gap-3 md:grid-cols-4">{["카드 찾기", "가격 비교", "수익 계산", "안전 거래"].map((step, index) => <div key={step} className="rounded-[8px] border border-[#263752] bg-[#0b1728] p-4"><div className="text-sm text-[#f5b85b]">STEP {index + 1}</div><div className="mt-2 font-bold">{step}</div></div>)}</div></Panel><Panel className="p-5"><SectionTitle title="핵심 가이드" action="" /><div className="mt-5 grid gap-4 md:grid-cols-2">{guideCategories.map(([title, body, items]) => <div key={title} className="rounded-[8px] border border-[#a86632] bg-[#0b1728] p-5"><div className="text-xl font-bold text-[#f5b85b]">{title}</div><p className="mt-2 text-sm leading-6 text-[#c7d0df]">{body}</p><div className="mt-4 space-y-2">{items.map((item) => <div key={item} className="flex items-center gap-2 text-sm text-[#9faabd]"><CheckCircle2 className="h-4 w-4 text-[#51e879]" />{item}</div>)}</div></div>)}</div></Panel><Panel className="p-5"><SectionTitle title="최신 가이드" action="" /><div className="mt-4 divide-y divide-[#1e2b40]">{quickGuides.map(([title, body, time]) => <button key={title} type="button" className="grid w-full gap-2 py-4 text-left md:grid-cols-[1fr_90px]"><span><span className="block font-bold text-white">{title}</span><span className="mt-1 block text-sm text-[#9faabd]">{body}</span></span><span className="text-right text-sm text-[#f5b85b]">{time}</span></button>)}</div></Panel></div>
      <aside className="space-y-4"><Panel className="p-5"><SectionTitle title="초보자 체크리스트" action="" /><div className="mt-4 space-y-3 text-sm text-[#c7d0df]">{["관심 카드 10장 먼저 등록", "최근판매가와 평균가 차이 확인", "USD/KRW 통화 전환으로 환율 감각 잡기", "구매 전 리셀 계산기로 손익분기 확인", "커뮤니티에서 거래 후기 검색"].map((item) => <div key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#51e879]" /><span>{item}</span></div>)}</div></Panel><Panel className="p-5"><SectionTitle title="추천 읽기 순서" action="" /><div className="mt-4 space-y-4">{guides.map((guide, index) => <div key={guide} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#c98733] font-bold">{index + 1}</span><span>{guide}</span></div>)}</div></Panel></aside>
    </div>
  );
}

export function RiftboundApp() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const historyReadyRef = useRef(false);
  const [currency, setCurrency] = useState<CurrencyMode>("KRW");
  const [catalog, setCatalog] = useState<CatalogPayload>(mockCatalog);
  const [cardFilters, setCardFilters] = useState<FilterState>(emptyFilters);
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<SealedProduct | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(favoriteStorageKey);
      const ids = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(ids.filter(Boolean));
    } catch {
      return new Set();
    }
  });
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(() => !isSupabaseAuthConfigured());
  const [authError, setAuthError] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [legalPanel, setLegalPanel] = useState<LegalPanelId | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadCatalog() {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      if (!response.ok) return;
      const nextCatalog = (await response.json()) as CatalogPayload;
      if (!ignore) setCatalog(nextCatalog);
    }

    void loadCatalog();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const applyLocationTab = () => {
      setSelectedCard(null);
      setSelectedProduct(null);
      setActiveTab(readTabFromLocation());
    };
    const handlePopState = () => {
      applyLocationTab();
    };
    window.addEventListener("popstate", handlePopState);
    window.setTimeout(() => {
      applyLocationTab();
      historyReadyRef.current = true;
    }, 0);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!historyReadyRef.current) return;
    pushTabToLocation(activeTab);
  }, [activeTab]);

  useEffect(() => {
    window.localStorage.setItem(favoriteStorageKey, JSON.stringify(Array.from(favoriteIds)));
  }, [favoriteIds]);

  useEffect(() => {
    if (!isSupabaseAuthConfigured()) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) setAuthError(error.message);
        setCurrentUser(mapSupabaseAuthUser(data.session?.user));
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(mapSupabaseAuthUser(session?.user));
      setAuthReady(true);
      if (session?.user) setAuthError(null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signinWithProvider = useCallback(async (provider: AuthProvider) => {
    setAuthError(null);
    if (!isSupabaseAuthConfigured()) {
      setAuthError("Supabase Auth 환경변수가 아직 설정되지 않았습니다.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    if (error) setAuthError(error.message);
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    if (isSupabaseAuthConfigured()) {
      const { error } = await getSupabaseBrowserClient().auth.signOut();
      if (error) {
        setAuthError(error.message);
        return;
      }
    }
    setCurrentUser(null);
    setAccountOpen(false);
  }, []);

  const navigateTab = useCallback((tab: TabId) => {
    setSelectedCard(null);
    setSelectedProduct(null);
    setActiveTab(tab);
  }, []);

  const openCard = useCallback((card: CardItem) => {
    setSelectedProduct(null);
    setSelectedCard(card);
  }, []);

  const openProduct = useCallback((product: SealedProduct) => {
    setSelectedCard(null);
    setSelectedProduct(product);
  }, []);

  const closeCard = useCallback(() => setSelectedCard(null), []);
  const closeProduct = useCallback(() => setSelectedProduct(null), []);

  const showCards = useCallback((filters: Partial<FilterState> = {}) => {
    setSelectedCard(null);
    setSelectedProduct(null);
    setCardFilters({ ...emptyFilters, ...filters });
    setActiveTab("cards");
  }, []);

  const toggleFavoriteCard = useCallback((card: CardItem) => {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(card.id)) next.delete(card.id);
      else next.add(card.id);
      return next;
    });
  }, []);

  const favoriteCards = useMemo(() => catalog.cards.filter((card) => favoriteIds.has(card.id)), [catalog.cards, favoriteIds]);

  const content = useMemo(() => {
    switch (activeTab) {
      case "cards":
        return <CardsView catalog={catalog} currency={currency} filters={cardFilters} onFiltersChange={setCardFilters} onOpenCard={openCard} />;
      case "sets":
        return <SetsView catalog={catalog} currency={currency} onOpenCard={openCard} onShowCards={showCards} />;
      case "market":
        return <MarketView catalog={catalog} currency={currency} onOpenProduct={openProduct} />;
      case "champions":
        return <ChampionsView catalog={catalog} currency={currency} onOpenCard={openCard} />;
      case "calculator":
        return <CalculatorView catalog={catalog} currency={currency} />;
      case "collection":
        return <FavoriteCollectionView catalog={catalog} currency={currency} favoriteCards={favoriteCards} onOpenCard={openCard} />;
      case "community":
        return <CommunityView catalog={catalog} currency={currency} currentUser={currentUser} onRequireAuth={() => setAccountOpen(true)} />;
      case "guides":
        return <GuidesView />;
      default:
        return <HomeView catalog={catalog} currency={currency} onTabChange={navigateTab} onOpenCard={openCard} onOpenProduct={openProduct} onShowCards={showCards} />;
    }
  }, [activeTab, cardFilters, catalog, currency, currentUser, favoriteCards, navigateTab, openCard, openProduct, showCards]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,rgba(5,10,19,0.72),rgba(5,10,19,1)),radial-gradient(circle_at_top_left,rgba(123,66,255,0.16),transparent_32rem)] text-[#f6efe2]">
      <Header activeTab={activeTab} onTabChange={navigateTab} currency={currency} onCurrencyChange={setCurrency} currentUser={currentUser} onAccountClick={() => setAccountOpen(true)} />
      <main className="mx-auto max-w-[1540px] px-3 py-4 sm:px-5">{content}</main>
      <Footer mode={catalog.mode} count={catalog.cards.length} onOpenLegal={setLegalPanel} />
      {selectedCard ? <CardDetailPanel card={selectedCard} currency={currency} isFavorite={favoriteIds.has(selectedCard.id)} onClose={closeCard} onToggleFavorite={toggleFavoriteCard} /> : null}
      {selectedProduct ? <ProductDetailPanel product={selectedProduct} currency={currency} cards={cardsForProduct(selectedProduct, catalog.cards)} onClose={closeProduct} /> : null}
      {legalPanel ? <LegalInfoPanel panel={legalPanel} onClose={() => setLegalPanel(null)} /> : null}
      {accountOpen ? (
        <AccountModal
          authError={authError}
          authReady={authReady}
          currentUser={currentUser}
          isAuthConfigured={isSupabaseAuthConfigured()}
          onClose={() => setAccountOpen(false)}
          onLogout={logout}
          onSignin={signinWithProvider}
        />
      ) : null}
    </div>
  );
}
