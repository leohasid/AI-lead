import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { suggestTargets } from "./ai";
import { ensureDeck, getProfile, isLocal, searchFor, type Reach } from "./profile";
import { findLeads } from "./sources";
import type { Lead } from "./types";
import { createAdminClient } from "./supabase/server";

/** Pull the next page of businesses for one filter into the user's deck. Returns the new leads. */
export async function fillDeck(db: SupabaseClient, user: User, reach: Reach): Promise<Lead[]> {
  let profile = getProfile(user);
  const deck = await ensureDeck(db, user);

  // No filters picked and AI hasn't yet chosen who suits this business: have it choose now, once.
  let chosen: { auto_terms: string[]; auto_tags: unknown } | null = null;
  if (!profile.types.length && !profile.target && !profile.autoTerms.length) {
    try {
      const { terms, tags } = await suggestTargets(profile.business);
      if (terms.length) {
        chosen = { auto_terms: terms, auto_tags: tags };
        profile = { ...profile, autoTerms: terms, autoTags: tags };
      }
    } catch {
      // No working AI key: fall back to every business type.
    }
  }

  // Each filter pages through its own results; remember how far we got.
  const pages: Partial<Record<Reach, number>> = user.user_metadata?.pages ?? {};
  let page = pages[reach] ?? 0;
  let added: Lead[] = [];

  // Filters overlap (Discover includes local businesses), so a page can be all
  // duplicates. Skip ahead a few pages before deciding there's nothing new.
  for (let tries = 0; tries < 3 && added.length === 0; tries++) {
    page += 1;
    let found = await findLeads({
      ...searchFor(profile),
      location: reach === "local" ? profile.location : null,
      home: profile.location,
      page,
    });
    if (found.length === 0) break;
    if (reach === "national") found = found.filter((l) => !isLocal(l, profile));

    const { data, error } = await db
      .from("leads")
      .upsert(
        found.map((l) => ({ ...l, owner_id: user.id, campaign_id: deck.id })),
        { onConflict: "campaign_id,external_id", ignoreDuplicates: true },
      )
      .select("*");
    if (error) throw error;
    added = (data ?? []) as Lead[];
  }

  // Admin write: updating via the user's client rotates their session, which a
  // page render can't save, and later queries in the same request lose auth.
  await createAdminClient().auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, ...chosen, pages: { ...pages, [reach]: page } },
  });
  return added;
}
