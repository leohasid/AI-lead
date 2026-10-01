import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureDeck, getProfile, isLocal, type Reach } from "./profile";
import { findLeads } from "./sources";
import type { Lead } from "./types";
import { createAdminClient } from "./supabase/server";

/** Pull the next page of businesses for one filter into the user's deck. Returns the new leads. */
export async function fillDeck(db: SupabaseClient, user: User, reach: Reach): Promise<Lead[]> {
  const profile = getProfile(user);
  const deck = await ensureDeck(db, user);

  // Each filter pages through its own results; remember how far we got.
  const pages: Partial<Record<Reach, number>> = user.user_metadata?.pages ?? {};
  const page = (pages[reach] ?? 0) + 1;

  let found = await findLeads({
    keywords: profile.target || null,
    location: reach === "local" ? profile.location : null,
    home: profile.location,
    page,
  });
  if (reach === "national") found = found.filter((l) => !isLocal(l, profile));

  // Admin write: updating via the user's client rotates their session, which a
  // page render can't save, and later queries in the same request lose auth.
  await createAdminClient().auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, pages: { ...pages, [reach]: page } },
  });
  if (found.length === 0) return [];

  const { data, error } = await db
    .from("leads")
    .upsert(
      found.map((l) => ({ ...l, owner_id: user.id, campaign_id: deck.id })),
      { onConflict: "campaign_id,external_id", ignoreDuplicates: true },
    )
    .select("*");
  if (error) throw error;
  return (data ?? []) as Lead[];
}
