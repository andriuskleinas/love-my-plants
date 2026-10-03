// Messenger-agnostic shapes, so WhatsApp/Viber can be added beside Telegram later.

export type MessengerPlatform = "telegram" | "whatsapp";

export interface MessageButton {
  text: string;
  /** Opaque payload returned when tapped (≤ 64 bytes for Telegram). */
  data: string;
}

/** Rows of buttons shown under a message. */
export type ButtonRows = MessageButton[][];

/** Escape user/plant text for HTML-formatted messages. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
