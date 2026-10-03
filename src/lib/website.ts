import "server-only";

// Reads a business's own website so the details sheet can say what they do
// in their own words, and link to the social profiles they publish.

const UA = "LeadSwipe/0.1 (lead discovery; contact via app owner)";

export type WebsiteInfo = {
  title: string | null;
  description: string | null; // the site's own one-line summary
  about: string[]; // the first substantial paragraphs
  socials: { name: string; url: string }[];
};

const SOCIALS: [string, RegExp][] = [
  ["Instagram", /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+/i],
  ["Facebook", /https?:\/\/(?:www\.|en-gb\.)?facebook\.com\/[A-Za-z0-9_.\-/]+/i],
  ["LinkedIn", /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_.\-%]+/i],
  ["TikTok", /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+/i],
  ["X", /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]+/i],
  ["YouTube", /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[A-Za-z0-9_.\-]+/i],
];
// Share buttons and plugin links, not the business's own profile.
const NOT_A_PROFILE = /sharer|share\?|intent\/|\/plugins|\/tr\?|\/policies|\/privacy|\/help|\/legal|\/p\/|\/reel\/|\/explore\//i;

function decode(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, name: string) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i"))?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : null;
}

async function fetchPage(url: string, ms = 7000) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(ms), cache: "no-store" });
    if (!res.ok || !res.headers.get("content-type")?.includes("html")) return null;
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  }
}

function paragraphs(html: string) {
  const body = html.replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ");
  const found: string[] = [];
  for (const [, inner] of body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = decode(inner.replace(/<[^>]+>/g, " "));
    // Real sentences, not menu items, cookie banners or copyright lines.
    if (text.length >= 80 && !/cookie|©|all rights reserved|javascript/i.test(text) && !found.includes(text)) found.push(text);
    if (found.length >= 4) break;
  }
  return found;
}

/** `quick` reads just the homepage with a short time limit, for when speed matters more than depth. */
export async function readWebsite(domain: string, quick = false): Promise<WebsiteInfo | null> {
  const home = await fetchPage(`https://${domain}`, quick ? 4000 : 7000);
  if (!home) return null;

  let about = paragraphs(home);
  // A thin homepage usually means the story is on the About page. A quick read
  // only goes there when the homepage gave nothing at all.
  const thin = about.join(" ").length < 250;
  const empty = !about.length && !meta(home, "description") && !meta(home, "og:description");
  if (quick ? empty : thin) {
    for (const path of ["/about", "/about-us"]) {
      const page = await fetchPage(`https://${domain}${path}`, quick ? 4000 : 7000);
      const more = page ? paragraphs(page) : [];
      if (more.join(" ").length > about.join(" ").length) about = more;
      if (about.join(" ").length >= 250) break;
    }
  }

  const title = home.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const socials = SOCIALS.flatMap(([name, pattern]) => {
    const url = [...home.matchAll(new RegExp(pattern, "gi"))].map((m) => m[0]).find((u) => !NOT_A_PROFILE.test(u));
    return url ? [{ name, url }] : [];
  });

  return {
    title: title ? decode(title).slice(0, 140) : null,
    description: meta(home, "description") ?? meta(home, "og:description"),
    about: about.map((p) => (p.length > 600 ? `${p.slice(0, 600).replace(/\s+\S*$/, "")}…` : p)).slice(0, 3),
    socials,
  };
}
