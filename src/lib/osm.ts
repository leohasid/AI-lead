import "server-only";
import type { LeadDraft } from "./apollo";
import type { LeadQuery } from "./sources";

// OpenStreetMap lead source: real businesses near the user. Free, no API key.
// - Nominatim turns "Manchester, UK" into coordinates.
// - Overpass lists named, independent businesses with a website around that point.
// OSM knows the business (name, category, address, website, sometimes an email),
// not the people in it, so leads from here have no contact name.

const UA = "LeadSwipe/0.1 (lead discovery; contact via app owner)";
const LOCAL_KM = 10;
const WIDE_KM = 20;
const PAGE_SIZE = 40;

type Coords = { lat: number; lon: number };
type Element = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: Coords;
  tags?: Record<string, string>;
};

const geocoded = new Map<string, Coords | null>();

async function geocode(place: string): Promise<Coords | null> {
  const key = place.trim().toLowerCase();
  if (geocoded.has(key)) return geocoded.get(key)!;
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000), cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Couldn't look up "${place}" (${res.status})`);
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  const coords = hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
  geocoded.set(key, coords);
  return coords;
}

// Kinds of place that are businesses worth pitching (not parks, schools, bus stops...).
const AMENITIES =
  "dentist|doctors|clinic|veterinary|pharmacy|restaurant|cafe|bar|pub|fast_food|driving_school|childcare|car_rental|car_wash|coworking_space|estate_agent|studio";
const LEISURE = "fitness_centre|sports_centre|dance|escape_game|bowling_alley";

// Paging re-reads the same area, so keep each area's result for a few minutes.
const areas = new Map<string, { at: number; elements: Element[] }>();

async function businessesAround(centre: Coords, km: number): Promise<Element[]> {
  const key = `${centre.lat},${centre.lon},${km}`;
  const cached = areas.get(key);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.elements;
  const elements = await queryOverpass(centre, km);
  areas.set(key, { at: Date.now(), elements });
  return elements;
}

// Public Overpass servers are free but can be slow or busy; try the main one, then a mirror.
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function queryOverpass({ lat, lon }: Coords, km: number): Promise<Element[]> {
  const around = `(around:${km * 1000},${lat},${lon})`;
  // Named, has a website, and not part of a chain ("brand" marks Tesco, Costa, etc).
  const base = `["name"]["website"][!"brand"]`;
  const query = `[out:json][timeout:25];
(
  nwr${around}${base}["shop"];
  nwr${around}${base}["office"];
  nwr${around}${base}["craft"];
  nwr${around}${base}["amenity"~"^(${AMENITIES})$"];
  nwr${around}${base}["leisure"~"^(${LEISURE})$"];
  nwr${around}${base}["tourism"~"^(hotel|guest_house|hostel)$"];
);
out center tags 400;`;

  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(25_000),
        cache: "no-store",
      });
      if (res.ok) return ((await res.json()) as { elements?: Element[] }).elements ?? [];
    } catch {
      // Timed out or unreachable: fall through to the next server.
    }
  }
  throw new Error("The business search is busy right now. Try again in a moment.");
}

function distanceKm(a: Coords, b: Coords) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const titleCase = (s: string) => (s === "ngo" ? "Non-profit" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));

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

/** Loose word match so "dentists" finds "dentist" and "gyms" finds "fitness centre gym". */
function stems(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replace(/(ies|es|s)$/, ""));
}

export async function searchOsm(query: LeadQuery): Promise<LeadDraft[]> {
  if (!query.home) return [];
  const home = await geocode(query.home);
  if (!home) throw new Error(`Couldn't find "${query.home}" on the map. Edit your location under More.`);

  const elements = await businessesAround(home, query.location ? LOCAL_KM : WIDE_KM);
  const wanted = new Set(stems(query.keywords ?? ""));
  // The user's own spelling of their town, so the Local filter recognises these leads.
  const town = titleCase(query.home.split(",")[0].trim());

  const seen = new Set<string>();
  const ranked = elements.flatMap((el) => {
    const t = el.tags ?? {};
    const at = el.center ?? (el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : null);
    const domain = domainOf(t.website);
    if (!at || !t.name || !domain || seen.has(domain)) return [];
    seen.add(domain);

    const km = distanceKm(home, at);
    const kind = t.shop ?? t.office ?? t.craft ?? t.amenity ?? t.leisure ?? t.tourism ?? "";
    const industry = t.shop && !/^(yes)$/.test(t.shop) ? `${titleCase(kind)} Shop` : titleCase(kind);
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    const area = km <= LOCAL_KM ? town : (t["addr:city"] ?? t["addr:suburb"] ?? `${Math.round(km)} km away`);
    const hits = stems(`${t.name} ${kind} ${t.cuisine ?? ""} ${t.description ?? ""}`).filter((w) => wanted.has(w)).length;
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
    // What the user asked for first, then ones we can already email, then nearest.
    return [{ lead, rank: hits * 100 + (email ? 10 : 0) - km / 10 }];
  });

  ranked.sort((a, b) => b.rank - a.rank);
  const start = (query.page - 1) * PAGE_SIZE;
  return ranked.slice(start, start + PAGE_SIZE).map((r) => r.lead);
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
