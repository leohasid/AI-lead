import Link from "next/link";

const STEPS = [
  ["Define who you want", "Titles, locations, company size, and what you sell."],
  ["Swipe", "Right to reach out, left to skip. We only look up emails for leads you pick."],
  ["AI writes the email", "A short, personal first email for each lead. Send automatically or review first."],
  ["Get pinged when it's warm", "Replies are read and sorted for you. Interested leads show up right away."],
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-20">
      <nav className="mb-20 flex items-center justify-between">
        <span className="text-lg font-semibold">
          Lead<span className="text-violet-400">Swipe</span>
        </span>
        <Link href="/login" className="btn-ghost">
          Sign in
        </Link>
      </nav>

      <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
        Find clients like you&apos;re picking a date.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-zinc-400">
        LeadSwipe finds decision-makers that match your ideal client, lets you swipe through them, writes the
        outreach, and pings you the moment someone is interested.
      </p>
      <div className="mt-10">
        <Link href="/login" className="btn-primary px-6 py-3 text-base">
          Start finding leads
        </Link>
      </div>

      <div className="mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([title, body], i) => (
          <div key={title} className="card p-5">
            <div className="mb-3 text-sm font-mono text-violet-400">0{i + 1}</div>
            <div className="font-medium">{title}</div>
            <p className="mt-2 text-sm text-zinc-400">{body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
