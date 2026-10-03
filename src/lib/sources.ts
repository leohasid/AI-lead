import "server-only";
import { apolloEnabled, searchPeople, type LeadDraft } from "./apollo";
import type { TagFilter } from "./categories";
import { searchOsm } from "./osm";

// Where leads come from. Every source turns a LeadQuery into business leads;
// results from all enabled sources are merged into the swipe deck.
//
// To add a source (LinkedIn data, Google Maps, social media, ...): write a
// function with the LeadSource shape and add it to sources(). Give its
// external_ids a prefix (e.g. "gmaps-") so they never collide with Apollo's.

export type LeadQuery = {
  filters: TagFilter[]; // the business types to look for
  keywords: string | null; // free-text description of who to target, when it couldn't be turned into filters
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
