export type LeadStatus =
  | "new"
  | "rejected"
  | "approved"
  | "drafted"
  | "contacted"
  | "replied"
  | "interested"
  | "not_interested"
  | "no_email";

export type Campaign = {
  id: string;
  owner_id: string;
  name: string;
  titles: string[];
  locations: string[];
  keywords: string | null;
  employee_ranges: string[];
  offer: string;
  sender_name: string;
  sender_email: string;
  signature: string;
  auto_send: boolean;
  created_at: string;
};

export type Lead = {
  id: string;
  owner_id: string;
  campaign_id: string;
  external_id: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  headline: string | null;
  company: string | null;
  company_domain: string | null;
  industry: string | null;
  location: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  email: string | null;
  status: LeadStatus;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  owner_id: string;
  lead_id: string;
  direction: "outbound" | "inbound";
  subject: string | null;
  body: string;
  status: "draft" | "sent" | "received" | "failed";
  provider_id: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  owner_id: string;
  lead_id: string | null;
  kind: "reply" | "interested";
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
};

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  rejected: "Skipped",
  approved: "Preparing",
  drafted: "Draft ready",
  contacted: "Contacted",
  replied: "Replied",
  interested: "Interested",
  not_interested: "Not interested",
  no_email: "No email found",
};
