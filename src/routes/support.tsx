import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Clock,
  Headphones,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  PlayCircle,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Panel, SectionLabel, fieldClass } from "@/components/app/checkout-ui";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import {
  createSupportTicket,
  markTicketReadByCustomer,
  sendSupportMessage,
  useCustomerSupportTickets,
  useSupportTicket,
  useSupportTicketMessages,
  type TicketPriority,
} from "@/lib/support";
import { cn } from "@/lib/utils";

const supportSearchSchema = z.object({
  ticketId: z.string().optional(),
  orderId: z.string().optional(),
});

export const Route = createFileRoute("/support")({
  validateSearch: supportSearchSchema,
  head: () => ({
    meta: [
      { title: "Help & support — Kasi Zonke Link" },
      {
        name: "description",
        content:
          "Chat live with customer support, get real-time assistance with your orders, and track inquiries.",
      },
      { property: "og:title", content: "Help & support — Kasi Zonke Link" },
      {
        property: "og:description",
        content:
          "Connect with our support team in real time for instant help with your food deliveries.",
      },
    ],
  }),
  component: SupportPage,
});

const QUICK_PROMPTS = [
  "Where is my driver right now?",
  "An item is missing from my order",
  "Food arrived cold or spilled",
  "I need to change my delivery address",
  "Payment or refund question",
];

const FILTERS = [
  { id: "all", label: "All" },
  { id: "open", label: "Active" },
  { id: "resolved", label: "Resolved" },
] as const;

type StatusFilter = (typeof FILTERS)[number]["id"];

const STATUS_TONES: Record<string, string> = {
  resolved: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  in_progress: "border-primary/25 bg-primary/10 text-primary",
};

function TicketStatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase",
        STATUS_TONES[status] ??
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function SupportPage() {
  const { ticketId: searchTicketId, orderId: searchOrderId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const { orders } = useCart();

  const customerId = user?.uid || "demo-thabo";
  const customerName = user?.name || "Thabo Mokoena";
  const customerEmail = user?.email || null;
  const customerPhone = user?.phone || "+27 82 555 1234";

  const {
    tickets,
    totalUnreadCount,
    loading: ticketsLoading,
  } = useCustomerSupportTickets(customerId, customerEmail);

  // Active selected ticket state
  const [activeTicketId, setActiveTicketId] = useState<string | null>(searchTicketId || null);

  // New ticket modal/form state
  const [showNewTicketModal, setShowNewTicketModal] = useState(
    Boolean(searchOrderId && !searchTicketId),
  );
  const [newSubject, setNewSubject] = useState(
    searchOrderId
      ? `Help with order #${orders.find((o) => o.id === searchOrderId)?.order_number || searchOrderId}`
      : "",
  );
  const [newMessage, setNewMessage] = useState("");
  const [newPriority, setNewPriority] = useState<TicketPriority>("medium");
  const [selectedOrderId, setSelectedOrderId] = useState<string>(searchOrderId || "");
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [creatingTicket, setCreatingTicket] = useState(false);

  // Chat message composer state
  const [messageText, setMessageText] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showAttachmentInput, setShowAttachmentInput] = useState(false);

  // Filter tab
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-select first ticket if none selected on desktop
  useEffect(() => {
    if (!activeTicketId && tickets.length > 0 && !showNewTicketModal && searchTicketId) {
      setActiveTicketId(searchTicketId);
    }
  }, [activeTicketId, tickets, showNewTicketModal, searchTicketId]);

  // Active Ticket & Messages Subscriptions
  const { ticket: activeTicket } = useSupportTicket(activeTicketId);
  const { messages, loading: messagesLoading } = useSupportTicketMessages(activeTicketId);

  // When opening a ticket, mark read for customer (§5.3)
  useEffect(() => {
    if (activeTicketId && activeTicket && (activeTicket.unread_for_customer || 0) > 0) {
      void markTicketReadByCustomer(activeTicketId);
    }
  }, [activeTicketId, activeTicket]);

  // Auto scroll to bottom of messages
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Filtered tickets list
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter === "open")
        return t.status === "open" || t.status === "in_progress" || t.status === "waiting";
      if (statusFilter === "resolved") return t.status === "resolved";
      return true;
    });
  }, [tickets, statusFilter]);

  // Handle creating new support ticket (§5.1)
  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubject.trim() || !newMessage.trim()) {
      toast.error("Please fill in both a subject and your message.");
      return;
    }

    setCreatingTicket(true);
    try {
      const linkedOrder = orders.find((o) => o.id === selectedOrderId);

      const result = await createSupportTicket({
        subject: newSubject.trim(),
        initialMessage: newMessage.trim(),
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        order_id: linkedOrder?.id || (selectedOrderId ? selectedOrderId : null),
        order_number:
          linkedOrder?.order_number || (selectedOrderId ? `FF-${selectedOrderId.slice(-6)}` : null),
        restaurant_id: linkedOrder?.restaurant_id || null,
        restaurant_name: linkedOrder?.restaurant_name || null,
        priority: newPriority,
        channel: "in_app",
        attachment_url: newAttachmentUrl.trim() || null,
      });

      toast.success("Support ticket created!", {
        description: "An agent will respond to your thread shortly.",
      });

      setShowNewTicketModal(false);
      setNewSubject("");
      setNewMessage("");
      setNewAttachmentUrl("");
      setSelectedOrderId("");
      setActiveTicketId(result.ticketId);

      void navigate({ search: { ticketId: result.ticketId } });
    } catch (err) {
      console.error("Failed to create ticket:", err);
      toast.error("Could not create ticket. Please check your connection.");
    } finally {
      setCreatingTicket(false);
    }
  }

  // Handle sending follow-up message in active thread (§5.2)
  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!activeTicketId || (!messageText.trim() && !attachmentUrl.trim())) return;

    setSendingMessage(true);
    try {
      await sendSupportMessage({
        ticket_id: activeTicketId,
        body: messageText.trim() || (attachmentUrl ? "Attached a document/screenshot." : ""),
        author_id: customerId,
        author_name: customerName,
        attachment_url: attachmentUrl.trim() || null,
      });

      setMessageText("");
      setAttachmentUrl("");
      setShowAttachmentInput(false);
    } catch (err) {
      console.error("Failed to send message:", err);
      toast.error("Failed to send message. Please try again.");
    } finally {
      setSendingMessage(false);
    }
  }

  function openNewTicket() {
    setShowNewTicketModal(true);
    setActiveTicketId(null);
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-full bg-background sm:max-w-[640px] md:max-w-4xl lg:max-w-6xl">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 px-4 pt-4 pb-3 backdrop-blur-md md:static">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/account"
              aria-label="Back to account"
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-secondary transition-colors hover:bg-secondary/70"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg leading-none font-black tracking-tight">Help</h1>
              <p className="mt-1.5 truncate text-xs text-muted-foreground">
                {totalUnreadCount > 0
                  ? `${totalUnreadCount} new ${totalUnreadCount === 1 ? "reply" : "replies"} from our team`
                  : "Chat with the Kasi Zonke Link team about any order"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openNewTicket}
            className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[11px] font-black tracking-wider text-primary-foreground uppercase shadow-sm transition-colors hover:bg-primary/90"
          >
            <MessageSquarePlus className="size-4" aria-hidden />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>
      </header>

      <main className="space-y-4 px-4 pt-5 pb-44 md:pb-24">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* Conversations list */}
          <div
            className={cn(
              "space-y-3 md:col-span-5 lg:col-span-4",
              activeTicketId ? "hidden md:block" : "block",
            )}
          >
            <div
              role="group"
              aria-label="Filter conversations"
              className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-secondary p-1"
            >
              {FILTERS.map((tab) => {
                const selected = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex h-9 cursor-pointer items-center justify-center rounded-lg text-[11px] font-black tracking-wider uppercase transition-all",
                      selected
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {ticketsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-2xl bg-secondary" />
                ))}
              </div>
            ) : filteredTickets.length === 0 ? (
              <Panel className="p-8 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-xl border border-border bg-secondary">
                  <Headphones className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <p className="mt-4 text-sm font-bold">
                  {statusFilter === "all" ? "No conversations yet" : "Nothing here"}
                </p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                  {statusFilter === "all"
                    ? "Something wrong with an order? Our team replies around the clock."
                    : "Try another filter, or start a new conversation."}
                </p>
                <button
                  type="button"
                  onClick={openNewTicket}
                  className="mt-5 inline-flex h-10 cursor-pointer items-center justify-center rounded-xl bg-primary px-5 text-[11px] font-black tracking-wider text-primary-foreground uppercase shadow-sm transition-colors hover:bg-primary/90"
                >
                  Start a conversation
                </button>
                {/* Most first-time questions are answered by the walkthrough. */}
                <Link
                  to="/how-it-works"
                  className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-primary hover:underline"
                >
                  <PlayCircle className="size-3.5" aria-hidden />
                  New here? Watch how to order
                </Link>
              </Panel>
            ) : (
              <div className="space-y-2">
                {filteredTickets.map((t) => {
                  const isSelected = activeTicketId === t.id;
                  const unread = Number(t.unread_for_customer) || 0;

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setActiveTicketId(t.id);
                        setShowNewTicketModal(false);
                        void navigate({ search: { ticketId: t.id } });
                      }}
                      className={cn(
                        "w-full cursor-pointer rounded-2xl border p-3.5 text-left shadow-sm transition-colors",
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-card hover:border-primary/25 hover:bg-secondary/30",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <TicketStatusPill status={t.status} />
                            {t.order_number ? (
                              <span className="truncate font-mono text-[10px] font-bold text-muted-foreground">
                                #{t.order_number}
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-1.5 truncate text-xs font-bold">{t.subject}</p>

                          {t.last_message ? (
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {t.last_message_from === "agent" ? "Agent: " : "You: "}
                              {t.last_message}
                            </p>
                          ) : null}
                        </div>

                        <div className="shrink-0 text-right">
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {t.updated_at
                              ? new Date(t.updated_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Now"}
                          </span>

                          {unread > 0 ? (
                            <span className="mt-1 inline-flex size-5 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-black text-primary-foreground">
                              {unread}
                              <span className="sr-only"> unread</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Thread, new conversation form, or placeholder */}
          <div className="md:col-span-7 lg:col-span-8">
            {showNewTicketModal ? (
              <Panel className="p-5">
                <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-black tracking-tight">New conversation</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Tell us what happened and we will pick it up from here.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewTicketModal(false)}
                    aria-label="Close"
                    className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>

                <form onSubmit={handleCreateTicket} className="space-y-4 pt-4">
                  <div>
                    <label
                      htmlFor="ticket-subject"
                      className="label-mono mb-2 block text-muted-foreground"
                    >
                      What is it about?
                    </label>
                    <input
                      id="ticket-subject"
                      type="text"
                      required
                      placeholder="Late delivery, missing item, refund…"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className={fieldClass}
                    />

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {QUICK_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => {
                            setNewSubject(prompt);
                            if (!newMessage) setNewMessage(prompt);
                          }}
                          className="cursor-pointer rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {orders.length > 0 ? (
                    <div>
                      <label
                        htmlFor="ticket-order"
                        className="label-mono mb-2 block text-muted-foreground"
                      >
                        Related order{" "}
                        <span className="font-sans normal-case opacity-70">(optional)</span>
                      </label>
                      <select
                        id="ticket-order"
                        value={selectedOrderId}
                        onChange={(e) => {
                          setSelectedOrderId(e.target.value);
                          const o = orders.find((ord) => ord.id === e.target.value);
                          if (o && !newSubject) {
                            setNewSubject(`Help with order #${o.order_number || o.id}`);
                          }
                        }}
                        className={cn(fieldClass, "cursor-pointer")}
                      >
                        <option value="">Not about a specific order</option>
                        {orders.map((o) => (
                          <option key={o.id} value={o.id}>
                            #{o.order_number || o.id} · {o.restaurant_name} ({o.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="ticket-priority"
                      className="label-mono mb-2 block text-muted-foreground"
                    >
                      How urgent is it?
                    </label>
                    <select
                      id="ticket-priority"
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                      className={cn(fieldClass, "cursor-pointer")}
                    >
                      <option value="low">Just a question</option>
                      <option value="medium">Standard request</option>
                      <option value="high">Problem with a live order</option>
                      <option value="urgent">Need help right now</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="ticket-message"
                      className="label-mono mb-2 block text-muted-foreground"
                    >
                      Your message
                    </label>
                    <textarea
                      id="ticket-message"
                      required
                      rows={4}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Tell us what went wrong, and what would put it right."
                      className={cn(fieldClass, "resize-none")}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ticket-attachment"
                      className="label-mono mb-2 block text-muted-foreground"
                    >
                      Photo or receipt link{" "}
                      <span className="font-sans normal-case opacity-70">(optional)</span>
                    </label>
                    <input
                      id="ticket-attachment"
                      type="url"
                      placeholder="https://…"
                      value={newAttachmentUrl}
                      onChange={(e) => setNewAttachmentUrl(e.target.value)}
                      className={fieldClass}
                    />
                  </div>

                  <div className="flex gap-2 border-t border-border pt-4">
                    <button
                      type="button"
                      onClick={() => setShowNewTicketModal(false)}
                      className="h-12 flex-1 cursor-pointer rounded-xl border border-border bg-secondary text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingTicket}
                      className="flex h-12 flex-[1.4] cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-xs font-black tracking-wider text-primary-foreground uppercase shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Send className="size-4" aria-hidden />
                      {creatingTicket ? "Sending…" : "Send"}
                    </button>
                  </div>
                </form>
              </Panel>
            ) : activeTicketId && activeTicket ? (
              <Panel className="flex h-[calc(100dvh-14rem)] min-h-[420px] flex-col overflow-hidden md:h-[650px]">
                {/* Thread header */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTicketId(null)}
                      aria-label="Back to conversations"
                      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-secondary text-muted-foreground md:hidden"
                    >
                      <ArrowLeft className="size-4" aria-hidden />
                    </button>

                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                      <Headphones className="size-4" aria-hidden />
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-bold">{activeTicket.subject}</h2>
                        <TicketStatusPill status={activeTicket.status} />
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {activeTicket.assigned_name
                          ? `With ${activeTicket.assigned_name}`
                          : "Waiting for an agent"}
                      </p>
                    </div>
                  </div>

                  {activeTicket.order_id ? (
                    <Link
                      to="/orders/$orderId"
                      params={{ orderId: activeTicket.order_id }}
                      className="hidden shrink-0 items-center rounded-lg border border-border bg-secondary px-3 py-2 text-[11px] font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground sm:inline-flex"
                    >
                      View order
                    </Link>
                  ) : null}
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-3.5 overflow-y-auto bg-secondary/30 p-4">
                  <div className="my-2 text-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 font-mono text-[10px] text-muted-foreground">
                      <Clock className="size-3" aria-hidden />
                      Opened{" "}
                      {new Date(activeTicket.created_at).toLocaleDateString([], {
                        dateStyle: "medium",
                      })}
                    </span>
                  </div>

                  {messagesLoading ? (
                    <div className="space-y-3 p-4">
                      <div className="ml-auto h-12 w-2/3 animate-pulse rounded-2xl bg-secondary" />
                      <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-secondary" />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="py-10 text-center text-xs text-muted-foreground">
                      No messages yet — send one below to reach our team.
                    </p>
                  ) : (
                    messages.map((m) => {
                      const isCustomer = m.from === "customer";

                      if (m.from === "system") {
                        return (
                          <div key={m.id} className="my-2 text-center">
                            <span className="rounded-lg bg-secondary px-3 py-1 text-[11px] text-muted-foreground">
                              {m.body}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex max-w-[85%] flex-col sm:max-w-[75%]",
                            isCustomer ? "ml-auto items-end" : "mr-auto items-start",
                          )}
                        >
                          <div className="mb-1 flex items-center gap-1.5 px-1">
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {isCustomer ? "You" : m.author_name || "Support"}
                            </span>
                            <span className="font-mono text-[9px] text-muted-foreground/60">
                              {m.at
                                ? new Date(m.at).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : ""}
                            </span>
                          </div>

                          <div
                            className={cn(
                              "rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm",
                              isCustomer
                                ? "rounded-tr-sm bg-primary text-primary-foreground"
                                : "rounded-tl-sm border border-border bg-card",
                            )}
                          >
                            <p className="whitespace-pre-wrap">{m.body}</p>

                            {m.attachment_url ? (
                              <div className="mt-2 border-t border-current/20 pt-2">
                                <a
                                  href={m.attachment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold underline"
                                >
                                  <Paperclip className="size-3" aria-hidden />
                                  View attachment
                                </a>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {activeTicket.status === "resolved" ? (
                  <p className="shrink-0 border-t border-emerald-500/20 bg-emerald-500/10 p-3 text-center text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    This conversation is resolved. Sending a message reopens it.
                  </p>
                ) : null}

                {/* Composer */}
                <form
                  onSubmit={handleSendMessage}
                  className="shrink-0 space-y-2 border-t border-border p-3"
                >
                  {showAttachmentInput ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        placeholder="Paste an image or document link…"
                        value={attachmentUrl}
                        onChange={(e) => setAttachmentUrl(e.target.value)}
                        className={cn(fieldClass, "py-2 text-xs")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAttachmentInput(false)}
                        className="shrink-0 cursor-pointer text-xs font-bold text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}

                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAttachmentInput((v) => !v)}
                      aria-label="Attach a link"
                      aria-pressed={showAttachmentInput}
                      className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Paperclip className="size-4" aria-hidden />
                    </button>

                    <textarea
                      rows={1}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendMessage();
                        }
                      }}
                      aria-label="Message"
                      placeholder="Write a message… (Enter to send)"
                      className={cn(fieldClass, "max-h-28 min-h-[44px] flex-1 resize-none text-xs")}
                    />

                    <button
                      type="submit"
                      disabled={sendingMessage || (!messageText.trim() && !attachmentUrl.trim())}
                      aria-label="Send message"
                      className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-40"
                    >
                      <Send className="size-4" aria-hidden />
                    </button>
                  </div>
                </form>
              </Panel>
            ) : (
              <div className="hidden md:block">
                <SectionLabel>Conversation</SectionLabel>
                <Panel className="flex h-[500px] flex-col items-center justify-center p-12 text-center">
                  <div className="grid size-16 place-items-center rounded-2xl border border-border bg-secondary">
                    <MessageSquare className="size-7 text-muted-foreground" aria-hidden />
                  </div>
                  <h3 className="mt-5 text-base font-black tracking-tight">Pick a conversation</h3>
                  <p className="mt-2 max-w-sm text-xs text-muted-foreground">
                    Choose one on the left to read the thread, or start a new conversation with our
                    team.
                  </p>
                  <button
                    type="button"
                    onClick={openNewTicket}
                    className="mt-6 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 text-[11px] font-black tracking-wider text-primary-foreground uppercase shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
                  >
                    <MessageSquarePlus className="size-4" aria-hidden />
                    New conversation
                  </button>
                </Panel>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
