import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Campaign, Lead } from "./types";

// What the user told us at onboarding. Stored on the auth user's metadata.
export type Profile = { business: string; target: string; location: string };

export type Reach = "best" | "local" | "national";
export const REACHES: [Reach, string][] = [
  ["best", "Best match"],
  ["local", "Local"],
  ["national", "Not local"],
];

export function getProfile(user: User): Profile {
  const m = user.user_metadata ?? {};
  return { business: m.business ?? "", target: m.target ?? "", location: m.location ?? "" };
}

export const isOnboarded = (user: User) => {
  const p = getProfile(user);
  return Boolean(p.business && p.location);
};

/**
 * Each user has one deck of leads. It's stored as a campaign row (leads and
 * emails hang off it) but kept in sync with the profile and never shown.
 */
export async function ensureDeck(db: SupabaseClient, user: User): Promise<Campaign> {
  const profile = getProfile(user);
  const fields = { offer: profile.business, keywords: profile.target || null };

  const { data: existing } = await db
    .from("campaigns")
    .select("*")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (existing) {
    if (existing.offer !== fields.offer || existing.keywords !== fields.keywords) {
      await db.from("campaigns").update(fields).eq("id", existing.id);
    }
    return { ...existing, ...fields } as Campaign;
  }

  const email = user.email ?? "";
  const name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const { data, error } = await db
    .from("campaigns")
    .insert({ ...fields, owner_id: user.id, name: "My leads", sender_name: name || "Me", sender_email: email })
    .select()
    .single();
  if (error) throw error;
  return data as Campaign;
}

/** True when the lead is in the same town/city as the user. */
export function isLocal(lead: Pick<Lead, "location">, profile: Profile) {
  const city = profile.location.split(",")[0].trim().toLowerCase();
  return Boolean(city && lead.location?.toLowerCase().includes(city));
}

const DECISION_MAKER = /owner|founder|ceo|director|president|partner|principal|manager/i;
const STOP = new Set(["and", "the", "for", "with", "our", "we", "you", "your", "that", "this", "are", "from", "who", "help"]);

function words(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Rough fit score used to order the "Best match" deck. Higher is better. */
export function fitScore(lead: Lead, profile: Profile) {
  const about = words([lead.company, lead.industry, lead.headline].filter(Boolean).join(" "));
  const target = new Set(words(profile.target));
  const business = new Set(words(profile.business));
  let score = 0;
  for (const w of about) {
    if (target.has(w)) score += 3;
    else if (business.has(w)) score += 1;
  }
  if (lead.title && DECISION_MAKER.test(lead.title)) score += 2;
  if (lead.company_domain) score += 1;
  if (lead.linkedin_url) score += 1;
  return score;
}
