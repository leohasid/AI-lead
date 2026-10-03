# LeadSwipe

Lead generation for agencies, with a Tinder-style swipe screen.

1. **Onboarding.** Say what your business does, where you're based and (optionally) which kinds of business you want to reach.
2. **Swipe.** Businesses appear as cards, Tinder-style: swipe right for yes, left for no. Filter by **Best match** (ranked by fit with your business), **Local** (near you) or **Not local**.
3. **AI outreach.** On a right swipe, the app looks up the decision-maker's verified work email and Claude writes a short, personal first email, saved as a draft for you to review.
4. **Replies.** Replies come back through Resend. Claude sorts each one (interested / question / not interested / unsubscribe / out-of-office), updates the pipeline and notifies you in the app (live bell + toast) and by email.

## Stack

Next.js 16 (App Router) · Supabase (Postgres, Auth, Realtime) · Claude (`@anthropic-ai/sdk`) · Apollo.io · Resend

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

1. **Supabase.** Create a project, then run [supabase/schema.sql](supabase/schema.sql) in the SQL editor. Copy the URL, anon key and service-role key into `.env.local`. Under Auth → URL configuration, add `http://localhost:3000/auth/callback` as a redirect URL.
2. **Claude.** Set `ANTHROPIC_API_KEY`.
3. **Apollo** (optional). Set `APOLLO_API_KEY` to use real leads. Without it the app runs in **demo mode** with sample leads. Search is free; each right swipe uses one enrichment credit.
4. **Resend** (optional). Without it, sends are simulated and logged to the console.
   - Verify your sending domain and use an address on it as the campaign's sender email.
   - Set up receiving on a subdomain (e.g. `in.youragency.com`) and set it as `INBOUND_DOMAIN`. Each lead gets a unique Reply-To address (`reply+<leadId>@in.youragency.com`), which is how replies are matched to the right lead.
   - Add a webhook for `email.received` pointing to `https://<your-app>/api/webhooks/resend`, and put its signing secret in `RESEND_WEBHOOK_SECRET`.
   - Set `NOTIFY_FROM_EMAIL` to get email alerts as well as in-app ones.

**Try the full flow without email set up:** finish onboarding, swipe right, open the lead, send the draft, then use **"Simulate a reply"** at the bottom of the conversation. Claude will classify the reply and the notification bell will light up.

## Where things live

| | |
|---|---|
| Lead lifecycle (enrich → draft → send → reply triage → notify) | [src/lib/pipeline.ts](src/lib/pipeline.ts) |
| Claude prompts (outreach writer, reply classifier) | [src/lib/ai.ts](src/lib/ai.ts) |
| Lead sources (add LinkedIn, Google, social here) | [src/lib/sources.ts](src/lib/sources.ts) |
| Real local businesses from OpenStreetMap (no key needed) | [src/lib/osm.ts](src/lib/osm.ts) |
| Apollo search/enrichment + demo leads | [src/lib/apollo.ts](src/lib/apollo.ts) |
| Profile, filters and "best match" scoring | [src/lib/profile.ts](src/lib/profile.ts) |
| Sending, reply-address matching | [src/lib/email.ts](src/lib/email.ts) |
| Swipe UI | [src/components/SwipeDeck.tsx](src/components/SwipeDeck.tsx) |
| Inbound webhook | [src/app/api/webhooks/resend/route.ts](src/app/api/webhooks/resend/route.ts) |

## Compliance notes

- **Cold email:** every email includes the sender's signature (put a postal address in it) and a plain opt-out line. "Unsubscribe" and "not interested" replies add the address to a suppression list, and the app won't email it again.
- **LinkedIn:** this app does **not** scrape LinkedIn or automate LinkedIn messages, since both break LinkedIn's Terms of Service and get accounts restricted. Lead data comes from Apollo, and cards link to the person's LinkedIn profile so you can connect by hand.
- If you target the EU/UK, check GDPR/PECR rules on B2B cold email for each country before sending.

## Next ideas

- Automatic follow-ups (day 3 / day 7) for leads that haven't replied
- Multiple team members per agency (the schema is per-user today)
- Calendar-link detection → "meeting booked" status
- Daily send limits and domain warm-up
