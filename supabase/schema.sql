-- LeadSwipe schema. Run in the Supabase SQL editor (or `supabase db push`).
-- Every row belongs to one user (the agency account); RLS keeps accounts isolated.

create extension if not exists "pgcrypto";

-- Campaign = who to target + what you're offering.
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  -- Targeting (maps to Apollo people search filters)
  titles text[] not null default '{}',
  locations text[] not null default '{}',
  keywords text,
  employee_ranges text[] not null default '{}', -- e.g. {"1,10","11,50"}
  -- Outreach
  offer text not null,          -- what the agency sells, in plain words
  sender_name text not null,
  sender_email text not null,   -- must be on a domain verified in Resend
  signature text not null default '', -- include a postal address (CAN-SPAM)
  auto_send boolean not null default false, -- send on right swipe without review
  created_at timestamptz not null default now()
);

create type lead_status as enum (
  'new',            -- in the swipe deck
  'rejected',       -- swiped left
  'approved',       -- swiped right, being enriched/drafted
  'drafted',        -- email written, waiting for review
  'contacted',      -- first email sent
  'replied',        -- replied, not clearly interested
  'interested',     -- AI flagged positive reply => "onboarded"
  'not_interested', -- declined or unsubscribed
  'no_email'        -- enrichment could not find an email
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  external_id text,              -- Apollo person id
  first_name text,
  last_name text,
  title text,
  headline text,
  company text,
  company_domain text,
  industry text,
  location text,
  linkedin_url text,
  photo_url text,
  email text,
  status lead_status not null default 'new',
  ai_summary text,               -- latest AI read of the conversation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, external_id)
);
create index if not exists leads_owner_status on leads (owner_id, status);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  subject text,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'received', 'failed')),
  provider_id text,
  created_at timestamptz not null default now()
);
create index if not exists messages_lead on messages (lead_id, created_at);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lead_id uuid references leads (id) on delete cascade,
  kind text not null, -- 'reply' | 'interested'
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Emails that must never be contacted again (unsubscribes / "not interested").
create table if not exists suppressions (
  owner_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (owner_id, email)
);

alter table campaigns enable row level security;
alter table leads enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table suppressions enable row level security;

create policy "own campaigns" on campaigns for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own leads" on leads for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own messages" on messages for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own notifications" on notifications for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own suppressions" on suppressions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Live notification bell.
alter publication supabase_realtime add table notifications;
