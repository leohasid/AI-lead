import DeckSkeleton from "@/components/DeckSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-5 h-[58px] w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] [@media(max-height:720px)]:mb-3" />
      <DeckSkeleton />
    </div>
  );
}
