// Shown in place of the swipe deck while its businesses are being found.
export default function DeckSkeleton() {
  return (
    <div className="flex w-full max-w-md flex-col items-center" role="status">
      <div className="flex h-[clamp(400px,calc(100dvh-330px),580px)] w-full animate-pulse flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] [@media(max-height:720px)]:h-[clamp(360px,calc(100dvh-300px),580px)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
        <p className="mt-4 text-sm text-zinc-300">Finding businesses…</p>
        <p className="mt-1 text-xs text-zinc-500">This can take a few seconds</p>
      </div>
    </div>
  );
}
