import "server-only";
import type { LeadDraft } from "./apollo";
import { searchArea } from "./osm";
import type { LeadQuery } from "./sources";

// Google Places lead source: real businesses with ratings, fast.
// Each batch runs a couple of Text Searches ("hair salons in Leeds"), 20 results
// each. Searches are billed per request, so a batch is kept to SEARCHES_PER_BATCH.
// Like the map source, Google knows the business, not the people in it.

const SEARCHES_PER_BATCH = 2;

export const googleEnabled = () => Boolean(process.env.GOOGLE_PLACES_API_KEY);

type Place = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
};

const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "shortFormattedAddress",
  "websiteUri",
  "nationalPhoneNumber",
  "rating",
  "userRatingCount",
  "primaryTypeDisplayName",
  "businessStatus",
]
  .map((f) => `places.${f}`)
  .join(",");

async function textSearch(textQuery: string, centre: { lat: number; lon: number }, km: number): Promise<Place[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": FIELDS,
    },
    body: JSON.stringify({
      textQuery,
      pageSize: 20,
      locationBias: { circle: { center: { latitude: centre.lat, longitude: centre.lon }, radius: km * 1000 } },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(`Google Places search failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return ((await res.json()) as { places?: Place[] }).places ?? [];
}

// A social profile isn't a website we can read an email from.
const NOT_A_SITE = /(facebook|instagram|twitter|x|linktr|tiktok|youtube)\.(com|ee)$/;

function domainOf(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return NOT_A_SITE.test(host) ? null : host;
  } catch {
    return null;
  }
}

export async function searchGoogle(query: LeadQuery): Promise<LeadDraft[]> {
  const where = await searchArea(query);
  if (!where || !query.terms.length) return [];

  // Each batch takes the next few search phrases. Discover moves to a new city
  // every batch, so it can keep cycling; Local stops once every phrase is used.
  const used = (query.page - 1) * SEARCHES_PER_BATCH;
  if (where.local && used >= query.terms.length) return [];
  // Discover starts halfway down the list, so the two tabs don't open on the same kinds of business.
  const start = used + (where.local ? 0 : Math.floor(query.terms.length / 2));
  const terms = Array.from(
    new Set(Array.from({ length: SEARCHES_PER_BATCH }, (_, i) => query.terms[(start + i) % query.terms.length])),
  );

  const results = await Promise.all(terms.map((term) => textSearch(`${term} in ${where.area}`, where.centre, where.km)));

  const seen = new Set<string>();
  // Deal the phrases out in turn so the batch mixes them.
  const mixed: Place[] = [];
  for (let i = 0; results.some((r) => r[i]); i++) for (const r of results) if (r[i]) mixed.push(r[i]);

  return mixed.flatMap((p) => {
    const domain = p.websiteUri ? domainOf(p.websiteUri) : null;
    // Needs a website: that's where the contact email comes from on a yes swipe.
    if (!p.displayName?.text || !domain || seen.has(domain)) return [];
    if (p.businessStatus && p.businessStatus !== "OPERATIONAL") return [];
    seen.add(domain);

    const street = (p.shortFormattedAddress ?? p.formattedAddress ?? "").split(",")[0].trim();
    const rating = p.rating ? `${p.rating.toFixed(1)}★ (${p.userRatingCount ?? 0} reviews)` : null;
    return [
      {
        external_id: `gmaps-${p.id}`,
        first_name: null,
        last_name: null,
        title: null,
        headline: [rating, p.nationalPhoneNumber].filter(Boolean).join(" · ") || null,
        company: p.displayName.text,
        company_domain: domain,
        industry: p.primaryTypeDisplayName?.text ?? null,
        // Ends with the area name so the Local filter recognises local leads.
        location: [street, where.area].filter((s, i, all) => s && all.indexOf(s) === i).join(", "),
        linkedin_url: null,
        photo_url: null,
      },
    ];
  });
}
