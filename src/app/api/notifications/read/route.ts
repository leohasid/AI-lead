import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";

export async function POST() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await supabase.from("notifications").update({ read: true }).eq("read", false);
  return NextResponse.json({ ok: true });
}
