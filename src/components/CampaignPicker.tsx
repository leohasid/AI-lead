"use client";

import { useRouter } from "next/navigation";
import type { Campaign } from "@/lib/types";

export default function CampaignPicker({ campaigns, current }: { campaigns: Campaign[]; current: string }) {
  const router = useRouter();
  return (
    <select className="input" value={current} onChange={(e) => router.push(`/swipe?c=${e.target.value}`)}>
      {campaigns.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  );
}
