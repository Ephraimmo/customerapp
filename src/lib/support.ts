import { useEffect, useMemo, useState } from "react";
import { rtdbGet, rtdbSet, rtdbSubscribe, rtdbUpdate } from "./firebase";

export type TicketChannel = "chat" | "email" | "phone" | "in_app";
export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface SupportTicket {
  id: string; // e.g. "tkt_m8x1a2b3c4"
  subject: string; // "Driver never arrived"
  channel: TicketChannel;
  status: TicketStatus;
  priority: TicketPriority;

  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;

  order_id: string | null; // link the ticket to an order when relevant
  order_number: string | null;
  restaurant_id: string | null;
  restaurant_name: string | null;

  assigned_to: string | null; // set by the console
  assigned_name: string | null;

  last_message: string | null; // first 160 chars, for list previews
  last_message_at: string | null; // ISO 8601
  last_message_from: "customer" | "agent" | null;
  unread_for_agent: number; // console badge — console resets to 0
  unread_for_customer: number; // customer app badge — app resets to 0

  created_at: string; // ISO 8601
  updated_at: string;
  resolved_at: string | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  from: "customer" | "agent" | "system";
  author_id: string | null;
  author_name: string;
  body: string;
  attachment_url: string | null;
  at: string; // ISO 8601
}

/**
 * Creates a new support ticket and writes the initial customer message
 * to `/support/tickets/{ticketId}` and `/support/messages/{ticketId}/{messageId}`.
 */
export async function createSupportTicket(input: {
  subject: string;
  initialMessage: string;
  customer_id: string | null;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  order_id?: string | null;
  order_number?: string | null;
  restaurant_id?: string | null;
  restaurant_name?: string | null;
  priority?: TicketPriority;
  channel?: TicketChannel;
  attachment_url?: string | null;
}): Promise<{ ticketId: string; messageId: string }> {
  const ts = new Date().toISOString();
  const ticketId = `tkt_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
  const messageId = `msg_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;

  const last_message = (input.initialMessage || "").trim().slice(0, 160);

  const ticket: SupportTicket = {
    id: ticketId,
    subject: input.subject.trim() || "Customer Inquiry",
    channel: input.channel || "in_app",
    status: "open",
    priority: input.priority || "medium",
    customer_id: input.customer_id ?? null,
    customer_name: input.customer_name || "Customer",
    customer_email: input.customer_email ?? null,
    customer_phone: input.customer_phone ?? null,
    order_id: input.order_id ?? null,
    order_number: input.order_number ?? null,
    restaurant_id: input.restaurant_id ?? null,
    restaurant_name: input.restaurant_name ?? null,
    assigned_to: null,
    assigned_name: null,
    last_message,
    last_message_at: ts,
    last_message_from: "customer",
    unread_for_agent: 1,
    unread_for_customer: 0,
    created_at: ts,
    updated_at: ts,
    resolved_at: null,
  };

  const message: SupportMessage = {
    id: messageId,
    ticket_id: ticketId,
    from: "customer",
    author_id: input.customer_id ?? null,
    author_name: input.customer_name || "Customer",
    body: input.initialMessage.trim(),
    attachment_url: input.attachment_url ?? null,
    at: ts,
  };

  await rtdbSet(`support/tickets/${ticketId}`, ticket);
  await rtdbSet(`support/messages/${ticketId}/${messageId}`, message);

  return { ticketId, messageId };
}

/**
 * Sends a follow-up message in an existing support thread.
 * Updates `/support/messages/{ticketId}/{messageId}` and PATCHes the ticket.
 */
export async function sendSupportMessage(input: {
  ticket_id: string;
  body: string;
  author_id: string | null;
  author_name: string;
  attachment_url?: string | null;
}): Promise<string> {
  const ts = new Date().toISOString();
  const messageId = `msg_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;

  const message: SupportMessage = {
    id: messageId,
    ticket_id: input.ticket_id,
    from: "customer",
    author_id: input.author_id ?? null,
    author_name: input.author_name || "Customer",
    body: input.body.trim(),
    attachment_url: input.attachment_url ?? null,
    at: ts,
  };

  // 1. Write the message
  await rtdbSet(`support/messages/${input.ticket_id}/${messageId}`, message);

  // 2. Fetch current ticket to increment unread count for agent
  const currentTicket = await rtdbGet<SupportTicket>(`support/tickets/${input.ticket_id}`);
  const prevUnread = Number(currentTicket?.unread_for_agent || 0);

  const updates: Record<string, unknown> = {
    last_message: input.body.trim().slice(0, 160),
    last_message_at: ts,
    last_message_from: "customer",
    unread_for_agent: prevUnread + 1,
    updated_at: ts,
  };

  // If ticket was resolved and customer sends a message, reopen it
  if (currentTicket?.status === "resolved") {
    updates["status"] = "open";
    updates["resolved_at"] = null;
  }

  await rtdbUpdate(`support/tickets/${input.ticket_id}`, updates);

  return messageId;
}

/**
 * Resets the unread counter for customer when opening a ticket thread.
 */
export async function markTicketReadByCustomer(ticketId: string): Promise<void> {
  if (!ticketId) return;
  try {
    await rtdbUpdate(`support/tickets/${ticketId}`, {
      unread_for_customer: 0,
    });
  } catch (err) {
    console.warn("Could not mark ticket read:", err);
  }
}

/**
 * Live subscription to all support tickets filtered for a specific customer.
 */
export function useCustomerSupportTickets(
  customerId: string | null | undefined,
  customerEmail?: string | null,
) {
  const [allTickets, setAllTickets] = useState<Record<string, SupportTicket>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = rtdbSubscribe<Record<string, SupportTicket>>("support/tickets", (data) => {
      setAllTickets(data && typeof data === "object" ? data : {});
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const tickets = useMemo<SupportTicket[]>(() => {
    if (!allTickets || typeof allTickets !== "object") return [];
    const list = Object.values(allTickets).filter((t): t is SupportTicket => {
      if (!t || typeof t !== "object" || !t.id) return false;
      if (customerId && t.customer_id === customerId) return true;
      if (
        customerEmail &&
        typeof t.customer_email === "string" &&
        t.customer_email.toLowerCase() === customerEmail.toLowerCase()
      ) {
        return true;
      }
      // Demo fallback or guest matching
      if (!customerId || customerId === "guest_customer" || customerId === "demo-thabo") {
        if (!t.customer_id || t.customer_id === "demo-thabo" || t.customer_id === "guest_customer") {
          return true;
        }
      }
      return false;
    });

    return list.sort((a, b) => {
      const dateA = a.updated_at || a.created_at || "";
      const dateB = b.updated_at || b.created_at || "";
      return dateB.localeCompare(dateA);
    });
  }, [allTickets, customerId, customerEmail]);

  const totalUnreadCount = useMemo(() => {
    return tickets.reduce((sum, t) => sum + (Number(t.unread_for_customer) || 0), 0);
  }, [tickets]);

  return { tickets, totalUnreadCount, loading };
}

/**
 * Live subscription to a single support ticket.
 */
export function useSupportTicket(ticketId: string | null | undefined) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(Boolean(ticketId));

  useEffect(() => {
    if (!ticketId) {
      setTicket(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = rtdbSubscribe<SupportTicket>(`support/tickets/${ticketId}`, (data) => {
      setTicket(data && typeof data === "object" ? data : null);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [ticketId]);

  return { ticket, loading };
}

/**
 * Live subscription to messages of a support ticket.
 */
export function useSupportTicketMessages(ticketId: string | null | undefined) {
  const [messagesMap, setMessagesMap] = useState<Record<string, SupportMessage>>({});
  const [loading, setLoading] = useState(Boolean(ticketId));

  useEffect(() => {
    if (!ticketId) {
      setMessagesMap({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = rtdbSubscribe<Record<string, SupportMessage>>(
      `support/messages/${ticketId}`,
      (data) => {
        setMessagesMap(data && typeof data === "object" ? data : {});
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [ticketId]);

  const messages = useMemo<SupportMessage[]>(() => {
    if (!messagesMap || typeof messagesMap !== "object") return [];
    return Object.values(messagesMap)
      .filter((m): m is SupportMessage => Boolean(m && typeof m === "object" && m.id && m.body))
      .sort((a, b) => {
        const dateA = a.at || "";
        const dateB = b.at || "";
        return dateA.localeCompare(dateB);
      });
  }, [messagesMap]);

  return { messages, loading };
}
