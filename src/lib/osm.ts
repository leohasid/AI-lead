import "server-only";
import type { LeadDraft } from "./apollo";
import type { TagFilter } from "./categories";
import type { LeadQuery } from "./sources";

// OpenStreetMap lead source: real businesses. Free, no API key.
// - Nominatim turns "Manchester, UK" into coordinates and a country.
// - Overpass lists named, independent businesses with a website around a point.
// OSM knows the business (name, category, address, website, sometimes an email),
// not the people in it, so leads from here have no contact name.

const UA = "LeadSwipe/0.1 (lead discovery; contact via app owner)";
const AREA_KM = 10; // the user's own area
const CITY_KM = 5; // a big city's centre is dense, and a smaller search is much quicker
const PAGE_SIZE = 40;

type Coords = { lat: number; lon: number };
type Place = Coords & { country: string };
type Element = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: Coords;
  tags?: Record<string, string>;
};

const geocoded = new Map<string, Place | null>();

async function geocode(place: string): Promise<Place | null> {
  const key = place.trim().toLowerCase();
  if (geocoded.has(key)) return geocoded.get(key)!;
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(place)}`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000), cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Couldn't look up "${place}" (${res.status})`);
  const [hit] = (await res.json()) as { lat: string; lon: string; address?: { country_code?: string } }[];
  const found = hit ? { lat: Number(hit.lat), lon: Number(hit.lon), country: hit.address?.country_code ?? "" } : null;
  geocoded.set(key, found);
  return found;
}

// Discover looks beyond the user's own area: one big city per batch, in rotation.
const CITIES: Record<string, [string, number, number][]> = {
  gb: [
    ["London", 51.5074, -0.1278], ["Birmingham", 52.4862, -1.8904], ["Leeds", 53.8008, -1.5491],
    ["Glasgow", 55.8642, -4.2518], ["Bristol", 51.4545, -2.5879], ["Liverpool", 53.4084, -2.9916],
    ["Manchester", 53.4808, -2.2426], ["Edinburgh", 55.9533, -3.1883], ["Sheffield", 53.3811, -1.4701],
    ["Newcastle", 54.9783, -1.6178], ["Nottingham", 52.9548, -1.1581], ["Cardiff", 51.4816, -3.1791],
  ],
  ie: [["Dublin", 53.3498, -6.2603], ["Cork", 51.8985, -8.4756], ["Galway", 53.2707, -9.0568], ["Limerick", 52.6638, -8.6267]],
  us: [
    ["New York", 40.7128, -74.006], ["Los Angeles", 34.0522, -118.2437], ["Chicago", 41.8781, -87.6298],
    ["Houston", 29.7604, -95.3698], ["Miami", 25.7617, -80.1918], ["Austin", 30.2672, -97.7431],
    ["Seattle", 47.6062, -122.3321], ["Boston", 42.3601, -71.0589], ["Denver", 39.7392, -104.9903],
    ["Atlanta", 33.749, -84.388],
  ],
  ca: [["Toronto", 43.6532, -79.3832], ["Vancouver", 49.2827, -123.1207], ["Montreal", 45.5017, -73.5673], ["Calgary", 51.0447, -114.0719]],
  au: [["Sydney", -33.8688, 151.2093], ["Melbourne", -37.8136, 144.9631], ["Brisbane", -27.4698, 153.0251], ["Perth", -31.9505, 115.8605]],
};

// Public Overpass servers are free but can be slow or busy, so there is a main one and a mirror.
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function queryOverpass({ lat, lon }: Coords, km: number, filters: TagFilter[], words: string[]): Promise<Element[]> {
  const around = `(around:${km * 1000},${lat},${lon})`;
  // Named, has a website, and not part of a chain ("brand" marks Tesco, Costa, etc).
  const base = `["name"]["website"][!"brand"]`;
  const clauses = filters.map((f) =>
    f.values.length ? `nwr${around}${base}["${f.key}"~"^(${f.values.join("|")})$"];` : `nwr${around}${base}["${f.key}"];`,
  );
  if (words.length) {
    // Free-text search: the words appear in the business's category, or (for
    // longer, more specific words) in its name. Pubs called "The Black Dog"
    // are why short words and food/leisure places are left out of the name match.
    clauses.push(`nwr${around}${base}[~"^(shop|office|craft|healthcare|amenity)$"~"${words.join("|")}",i];`);
    const specific = words.filter((w) => w.length >= 5);
    if (specific.length) {
      clauses.push(`nwr${around}${base}["name"~"${specific.join("|")}",i][~"^(shop|office|craft|healthcare)$"~"."];`);
    }
  }
  const query = `[out:json][timeout:25];\n(\n${clauses.join("\n")}\n);\nout center tags 400;`;

  const ask = async (url: string, signal: AbortSignal) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return ((await res.json()) as { elements?: Element[] }).elements ?? [];
  };

  // Ask the main server; if it hasn't answered after a few seconds (or fails),
  // ask the mirror as well and take whichever replies first.
  const done = new AbortController();
  const [main, mirror] = OVERPASS;
  const first = ask(main, done.signal);
  const backup = Promise.race([
    first.then(
      () => new Promise<never>(() => {}),
      () => undefined,
    ),
    new Promise((resolve) => setTimeout(resolve, 8_000)),
  ]).then(() => ask(mirror, done.signal));
  try {
    return await Promise.any([first, backup]);
  } catch {
    throw new Error("The business search is busy right now. Try again in a moment.");
  } finally {
    done.abort();
  }
}

// Paging re-reads the same area, so keep each search's result for a few minutes.
const searches = new Map<string, { at: number; elements: Element[] }>();

async function businessesAround(centre: Coords, km: number, filters: TagFilter[], words: string[]): Promise<Element[]> {
  const key = JSON.stringify([centre.lat, centre.lon, km, filters, words]);
  const cached = searches.get(key);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.elements;
  const elements = await queryOverpass(centre, km, filters, words);
  searches.set(key, { at: Date.now(), elements });
  return elements;
}

function distanceKm(a: Coords, b: Coords) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const titleCase = (s: string) =>
  s === "ngo" ? "Non-profit" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// A social profile isn't a website we can read an email from.
const NOT_A_SITE = /(facebook|instagram|twitter|x|linktr|tiktok|youtube)\.(com|ee)$/;

function domainOf(url: string | undefined) {
  if (!url) return null;
  try {
    const host = new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
    return NOT_A_SITE.test(host) ? null : host;
  } catch {
    return null;
  }
}

const FILLER = new Set(["and", "the", "for", "with", "any", "all", "that", "who", "business", "businesses", "company", "companies", "local", "small"]);

/** Loose word stems so "dentists" finds "dentist" and "dog groomers" finds "pet grooming". */
function stems(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !FILLER.has(w))
    .map((w) => w.replace(/(ies|es|s)$/, ""))
    // "groomer" and "grooming" both become "groom", which also matches the map's "pet_grooming".
    .map((w) => (w.length >= 6 ? w.replace(/(er|ing)$/, "") : w))
    .filter((w) => w.length > 2);
}

export type SearchArea = { centre: Coords; area: string; km: number; page: number; local: boolean };

/**
 * Where one batch looks. Local searches the user's own area. Discover rotates
 * through the country's big cities (skipping the user's own), one per batch.
 */
export async function searchArea(query: LeadQuery): Promise<SearchArea | null> {
  if (!query.home) return null;
  const home = await geocode(query.home);
  if (!home) throw new Error(`Couldn't find "${query.home}" on the map. Edit your location under More.`);
  // The user's own spelling of their town, so the Local filter recognises these leads.
  const town = titleCase(query.home.split(",")[0].trim());

  const elsewhere = (CITIES[home.country] ?? []).filter(([, lat, lon]) => distanceKm(home, { lat, lon }) > AREA_KM * 2);
  if (query.location || !elsewhere.length) return { centre: home, area: town, km: AREA_KM, page: query.page, local: true };
  const [name, lat, lon] = elsewhere[(query.page - 1) % elsewhere.length];
  return {
    centre: { lat, lon },
    area: name,
    km: CITY_KM,
    page: Math.floor((query.page - 1) / elsewhere.length) + 1,
    local: false,
  };
}

export async function searchOsm(query: LeadQuery): Promise<LeadDraft[]> {
  const where = await searchArea(query);
  if (!where) return [];
  const { centre, area, km, page } = where;

  const words = [...new Set(stems(query.keywords ?? ""))].slice(0, 8);
  const elements = await businessesAround(centre, km, query.filters, words);

  const seen = new Set<string>();
  const found = elements.flatMap((el) => {
    const t = el.tags ?? {};
    const at = el.center ?? (el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : null);
    const domain = domainOf(t.website);
    if (!at || !t.name || !domain || seen.has(domain)) return [];
    seen.add(domain);

    const kind = t.shop ?? t.office ?? t.craft ?? t.amenity ?? t.leisure ?? t.tourism ?? t.healthcare ?? "";
    const industry = t.shop && t.shop !== "yes" ? `${titleCase(kind)} Shop` : titleCase(kind);
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    const hits = stems(`${t.name} ${kind} ${t.cuisine ?? ""} ${t.description ?? ""}`).filter((w) => words.includes(w)).length;
    const email = t.email ?? t["contact:email"] ?? null;

    const lead: LeadDraft = {
      external_id: `osm-${el.type}-${el.id}`,
      first_name: null,
      last_name: null,
      title: null,
      headline: t.phone ?? t["contact:phone"] ?? null,
      company: t.name,
      company_domain: domain,
      industry: industry || null,
      location: [street, area].filter(Boolean).join(", "),
      linkedin_url: null,
      photo_url: null,
      email,
    };
    // What the user asked for first, then ones we can already email, then nearest the centre.
    return [{ lead, kind, rank: hits * 100 + (email ? 10 : 0) - distanceKm(centre, at) / 10 }];
  });
  found.sort((a, b) => b.rank - a.rank);

  // Deal the kinds out in turn, so a batch isn't forty cafés in a row.
  const byKind = new Map<string, typeof found>();
  for (const f of found) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
  const mixed: LeadDraft[] = [];
  for (let i = 0; mixed.length < found.length; i++) {
    for (const group of byKind.values()) if (group[i]) mixed.push(group[i].lead);
  }

  const start = (page - 1) * PAGE_SIZE;
  return mixed.slice(start, start + PAGE_SIZE);
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
const JUNK = /\.(png|jpe?g|gif|webp|svg|css|js)$|example\.|sentry|wixpress|@(2x|3x)/i;

/** Look for a contact email the business publishes on its own website. */
export async function findWebsiteEmail(domain: string): Promise<string | null> {
  for (const path of ["", "/contact", "/contact-us"]) {
    try {
      const res = await fetch(`https://${domain}${path}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const html = (await res.text()).slice(0, 500_000);
      const found = [...new Set(html.match(EMAIL) ?? [])].map((e) => e.toLowerCase()).filter((e) => !JUNK.test(e));
      // Prefer an address on the business's own domain over a webmaster's or a plugin's.
      const best = found.find((e) => e.endsWith(`@${domain}`)) ?? found[0];
      if (best) return best;
    } catch {
      // Site down or slow: try the next page.
    }
  }
  return null;
}
