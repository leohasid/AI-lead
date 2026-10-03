import "server-only";
import { apolloEnabled, searchPeople, type LeadDraft } from "./apollo";
import { searchOsm } from "./osm";

// Where leads come from. Every source turns a LeadQuery into business leads;
// results from all enabled sources are merged into the swipe deck.
//
// To add a source (LinkedIn data, Google Maps, social media, ...): write a
// function with the LeadSource shape and add it to sources(). Give its
// external_ids a prefix (e.g. "gmaps-") so they never collide with Apollo's.

export type LeadQuery = {
  keywords: string | null; // the kinds of business the user wants to target
  location: string | null; // only search here (null = anywhere)
  home: string | null; // the user's own location, for context
  page: number;
};

export type LeadSource = (query: LeadQuery) => Promise<LeadDraft[]>;

// OpenStreetMap needs no key, so it's always on. Apollo adds named decision-makers once it has a key.
const sources = (): LeadSource[] => (apolloEnabled() ? [searchOsm, searchPeople] : [searchOsm]);

export async function findLeads(query: LeadQuery): Promise<LeadDraft[]> {
  const results = await Promise.allSettled(sources().map((source) => source(query)));
  const leads = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (!leads.length) {
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
  }
  return leads;
}
