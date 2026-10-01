import "server-only";
import type { LeadQuery } from "./sources";

// Apollo.io lead source.
// - People search (/mixed_people/api_search) is credit-free but returns partial
//   profiles (no email, sometimes an obfuscated last name).
// - People match (/people/match) costs a credit and returns the full profile + email.
// We search freely to fill the swipe deck and only enrich leads you swipe right on.

const BASE = "https://api.apollo.io/api/v1";

export const apolloEnabled = () => Boolean(process.env.APOLLO_API_KEY);

export type LeadDraft = {
  external_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  headline: string | null;
  company: string | null;
  company_domain: string | null;
  industry: string | null;
  location: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  email?: string | null;
};

type ApolloPerson = Record<string, unknown> & {
  id: string;
  first_name?: string;
  last_name?: string;
  last_name_obfuscated?: string;
  title?: string;
  headline?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
  photo_url?: string;
  email?: string;
  email_status?: string;
  organization?: {
    name?: string;
    primary_domain?: string;
    website_url?: string;
    industry?: string;
  };
};

async function apollo<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": process.env.APOLLO_API_KEY!,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Apollo ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

function toLead(p: ApolloPerson): LeadDraft {
  const location = [p.city, p.state, p.country].filter(Boolean).join(", ");
  return {
    external_id: p.id,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? p.last_name_obfuscated ?? null,
    title: p.title ?? null,
    headline: p.headline ?? null,
    company: p.organization?.name ?? null,
    company_domain: p.organization?.primary_domain ?? null,
    industry: p.organization?.industry ?? null,
    location: location || null,
    linkedin_url: p.linkedin_url ?? null,
    photo_url: p.photo_url ?? null,
  };
}

export async function searchPeople(query: LeadQuery): Promise<LeadDraft[]> {
  if (!apolloEnabled()) return demoLeads(query);

  const data = await apollo<{ people?: ApolloPerson[] }>("/mixed_people/api_search", {
    person_titles: DECISION_MAKERS,
    person_locations: query.location ? [query.location] : undefined,
    q_keywords: query.keywords || undefined,
    page: query.page,
    per_page: 25,
  });
  return (data.people ?? []).map(toLead);
}

// We swipe on businesses, so reach the person who can say yes.
const DECISION_MAKERS = ["Owner", "Founder", "Co-Founder", "CEO", "Managing Director", "Director"];

/** Reveal full profile + work email for one person. Costs an Apollo credit. */
export async function enrichPerson(externalId: string): Promise<LeadDraft | null> {
  if (!apolloEnabled()) {
    return externalId.startsWith("demo-")
      ? { ...DEMO_ENRICH, external_id: externalId, email: `${externalId}@example.com` }
      : null;
  }
  const data = await apollo<{ person?: ApolloPerson }>("/people/match", {
    id: externalId,
    reveal_personal_emails: false,
  });
  if (!data.person) return null;
  const lead = toLead(data.person);
  const verified = !data.person.email_status || data.person.email_status === "verified";
  return { ...lead, email: verified ? data.person.email ?? null : null };
}

// ---------- Demo mode (no APOLLO_API_KEY) ----------

const DEMO_ENRICH: Omit<LeadDraft, "external_id"> = {
  first_name: null,
  last_name: null,
  title: null,
  headline: null,
  company: null,
  company_domain: null,
  industry: null,
  location: null,
  linkedin_url: null,
  photo_url: null,
};

const FIRST = ["Maya", "Jordan", "Priya", "Lucas", "Sofia", "Ethan", "Amara", "Noah", "Chloe", "Diego"];
const LAST = ["Chen", "Okafor", "Patel", "Rossi", "Nguyen", "Schmidt", "Haddad", "Silva", "Kim", "Brooks"];
const COMPANIES = [
  ["Brightpath Dental", "brightpathdental.com", "Health, Wellness & Fitness"],
  ["Northwind Roofing", "northwindroofing.com", "Construction"],
  ["Lumen Skincare", "lumenskin.co", "Cosmetics"],
  ["Harbor & Pine Realty", "harborpine.com", "Real Estate"],
  ["Ferro Fitness", "ferrofit.com", "Health, Wellness & Fitness"],
  ["Cobalt SaaS Labs", "cobaltlabs.io", "Computer Software"],
  ["Greenleaf Landscaping", "greenleafyard.com", "Consumer Services"],
  ["Atlas Legal Group", "atlaslegal.com", "Law Practice"],
];

const ELSEWHERE = ["Austin, TX, US", "Miami, FL, US", "London, UK", "Leeds, UK", "Bristol, UK", "Dublin, Ireland"];

function demoLeads(query: LeadQuery): LeadDraft[] {
  return Array.from({ length: 10 }, (_, i) => {
    const n = (query.page - 1) * 10 + i;
    const [company, domain, industry] = COMPANIES[n % COMPANIES.length];
    const title = DECISION_MAKERS[n % DECISION_MAKERS.length];
    // Local searches stay in the user's area; the rest are spread out (with a few local ones mixed in).
    const location = query.location ?? (n % 4 === 0 && query.home ? query.home : ELSEWHERE[n % ELSEWHERE.length]);
    return {
      external_id: `demo-${query.location ? "local" : "any"}-${n}`,
      first_name: FIRST[n % FIRST.length],
      last_name: LAST[(n * 3) % LAST.length],
      title,
      headline: `${title} at ${company}`,
      company,
      company_domain: domain,
      industry,
      location,
      linkedin_url: null,
      photo_url: null,
    };
  });
}
