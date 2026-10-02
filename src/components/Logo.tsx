import { Flame } from "lucide-react";
import Link from "next/link";

export default function Logo({ href = "/swipe", tagline = true }: { href?: string; tagline?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <Flame size={34} strokeWidth={1.5} className="fill-violet-500 text-fuchsia-400" />
      <span className="leading-tight">
        <span className="block text-2xl font-bold tracking-tight">
          Lead<span className="text-violet-400">Swipe</span>
        </span>
        {tagline && <span className="block text-xs text-zinc-400">More Leads. Less Effort.</span>}
      </span>
    </Link>
  );
}
