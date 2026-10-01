import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

const list = z
  .string()
  .optional()
  .transform((s) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean));

const CampaignInput = z.object({
  name: z.string().min(1),
  titles: list,
  locations: list,
  keywords: z.string().optional(),
  employee_ranges: z.array(z.string()).default([]),
  offer: z.string().min(10, "Describe your offer in a sentence or two"),
  sender_name: z.string().min(1),
  sender_email: z.string().email(),
  signature: z.string().default(""),
  auto_send: z.boolean().default(false),
});

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CampaignInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("campaigns")
    .insert({ ...parsed.data, owner_id: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
