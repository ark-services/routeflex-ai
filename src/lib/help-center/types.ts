export interface HelpCategory {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  article_count?: number;
}

export interface HelpArticle {
  id: string;
  category_id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  tags: string[];
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
  category?: HelpCategory;
}

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high";

export interface HelpTicket {
  id: string;
  ticket_number: number;
  user_id: string | null;
  name: string;
  email: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  slack_channel: string | null;
  slack_ts: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface HelpTicketMessage {
  id: string;
  ticket_id: string;
  sender_type: "user" | "admin" | "system";
  sender_name: string | null;
  body: string;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
