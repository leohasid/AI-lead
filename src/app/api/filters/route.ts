import { NextResponse } from "next/server";
import { interpretBusinessTypes } from "@/lib/ai";
import { CATEGORIES, type TagFilter } from "@/lib/categories";
import { getProfile } from "@/lib/profile";
import { createAdminClient, requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

// Save which kinds of business the user wants to see, and restart their deck with them.
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { types?: string[]; other?: string };
  const types = CATEGORIES.map((c) => c.id).filter((id) => body.types?.includes(id));
  const other = (body.other ?? "").trim().slice(0, 200);

  // AI works out which businesses the "other" text means. Without it (no key,
  // or it failed) the search falls back to matching the words themselves.
  const before = getProfile(user);
  let targetTags: TagFilter[] = other === before.target ? before.targetTags : [];
  if (other && !targetTags.length) {
    try {
      targetTags = await interpretBusinessTypes(other);
    } catch {
      targetTags = [];
    }
  }

  // Admin write: updating through the user's own client would rotate their session.
  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, types, target: other, target_tags: targetTags, pages: null },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Unswiped cards were found with the old filters; drop them so the deck refills.
  await supabase.from("leads").delete().eq("status", "new");

  return NextResponse.json({ ok: true, understood: !other || targetTags.length > 0 });
}
