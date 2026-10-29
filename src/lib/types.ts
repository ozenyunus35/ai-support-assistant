export type Category = "orders" | "returns" | "products" | "warranty" | "account" | "club";

export interface Article {
  id: string;
  title: string;
  category: Category;
  /** Plain text with light markup: blank-line paragraphs, "## " section headings, "- " bullets. */
  body: string;
  updatedAt: string;
}

/** Words and phrases that mean the same thing to customers. The first term is the canonical one. */
export interface SynonymGroup {
  id: string;
  terms: string[];
}

export interface Citation {
  articleId: string;
  title: string;
  heading: string | null;
}

export type AnswerKind = "answer" | "greeting" | "thanks" | "handoff" | "order" | "clarify";

export interface AnswerMeta {
  kind: AnswerKind;
  confidence: number;
  citations: Citation[];
  /** Matched query terms after normalisation, shown in the admin transcript. */
  matched: string[];
}

export interface OrderCard {
  number: string;
  status: OrderStatus;
  items: string[];
  carrier: string;
  eta: string;
  placedAt: string;
}

export type Role = "customer" | "assistant" | "agent" | "system";

export interface Message {
  id: string;
  role: Role;
  text: string;
  at: string;
  agentId?: string;
  answer?: AnswerMeta;
  order?: OrderCard;
  feedback?: "up" | "down";
}

export type ConversationStatus = "open" | "needs-human" | "agent" | "resolved";

export interface Customer {
  name: string;
  email: string;
  location: string;
}

export interface Conversation {
  id: string;
  customer: Customer;
  status: ConversationStatus;
  resolvedBy?: "ai" | "agent";
  startedAt: string;
  updatedAt: string;
  handoffAt?: string;
  assigneeId?: string;
  /** Category of the first cited article, used for topic analytics. */
  topic?: Category;
  /** True for the conversation started in this browser through the widget. */
  live?: boolean;
  messages: Message[];
}

export interface Agent {
  id: string;
  name: string;
  title: string;
}

export type OrderStatus = "processing" | "shipped" | "out-for-delivery" | "delivered";

export interface Order {
  number: string;
  email: string;
  items: string[];
  status: OrderStatus;
  carrier: string;
  placedAt: string;
  eta: string;
}

export interface Settings {
  assistantName: string;
  greeting: string;
  suggestions: string[];
  /** Answers below this confidence (0..1) are handed to a person. */
  threshold: number;
  handoffMessage: string;
  replyTime: string;
}

export interface DemoState {
  version: number;
  articles: Article[];
  synonyms: SynonymGroup[];
  conversations: Conversation[];
  agents: Agent[];
  orders: Order[];
  settings: Settings;
}
