import { NextResponse } from "next/server";
import { fillDeck } from "@/lib/deck";
import type { Reach } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

// "Find more businesses" button: pulls the next page for one filter.
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reach } = (await req.json()) as { reach: Reach };
  try {
    return NextResponse.json({ added: (await fillDeck(supabase, user, reach)).length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
