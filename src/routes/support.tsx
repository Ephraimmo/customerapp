import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Headphones,
  HelpCircle,
  Image as ImageIcon,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  Phone,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Store,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { BottomNav } from "@/components/app/bottom-nav";
import { CartBar } from "@/components/app/cart-bar";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import {
  createSupportTicket,
  markTicketReadByCustomer,
  sendSupportMessage,
  useCustomerSupportTickets,
  useSupportTicket,
  useSupportTicketMessages,
  type SupportTicket,
  type TicketPriority,
} from "@/lib/support";

const supportSearchSchema = z.object({
  ticketId: z.string().optional(),
  orderId: z.string().optional(),
});

export const Route = createFileRoute("/support")({
  validateSearch: supportSearchSchema,
  head: () => ({
    meta: [
      { title: "Customer Support & Live Help — Hearth" },
      {
        name: "description",
        content:
          "Chat live with customer support, get real-time assistance with your orders, and track inquiries.",
      },
      { property: "og:title", content: "Customer Support & Live Help — Hearth" },
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
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");

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

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background md:max-w-4xl lg:max-w-6xl">
      {/* Header */}
      <header className="sticky top-0 z-40 md:static border-b border-border bg-background/95 px-4 pt-4 pb-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/account"
              aria-label="Back to account"
              className="grid size-10 place-items-center rounded-full bg-secondary ring-1 ring-border hover:bg-secondary/80 transition-colors"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-foreground">
                  Customer Support Desk
                </h1>
                <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                ForkFleet Live Support Operations • Real-time agent assistance
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowNewTicketModal(true);
              setActiveTicketId(null);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-md hover:bg-primary/90 transition-all cursor-pointer"
          >
            <MessageSquarePlus className="size-4" />
            <span className="hidden sm:inline">New Inquiry</span>
          </button>
        </div>
      </header>

      <main className="p-4 space-y-4 pb-44 md:pb-24">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Left Column: Tickets List */}
          <div
            className={`md:col-span-5 lg:col-span-4 space-y-3 ${
              activeTicketId ? "hidden md:block" : "block"
            }`}
          >
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-secondary/80 p-1 rounded-2xl border border-border">
              {[
                { id: "all", label: "All Tickets" },
                { id: "open", label: "Active" },
                { id: "resolved", label: "Resolved" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`flex-1 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === tab.id
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tickets Stream List */}
            {ticketsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />
                ))}
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="rounded-3xl bg-secondary/60 p-8 text-center border border-border space-y-3">
                <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary mx-auto">
                  <Headphones className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-black text-foreground">No support tickets found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Have a question or need assistance with your order? Our team is available 24/7.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(true)}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 cursor-pointer"
                >
                  Start an Inquiry
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTickets.map((t) => {
                  const isSelected = activeTicketId === t.id;
                  const isResolved = t.status === "resolved";
                  const unread = Number(t.unread_for_customer) || 0;

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setActiveTicketId(t.id);
                        setShowNewTicketModal(false);
                        void navigate({ search: { ticketId: t.id } });
                      }}
                      className={`rounded-2xl p-3.5 border transition-all cursor-pointer relative ${
                        isSelected
                          ? "bg-card border-primary ring-2 ring-primary/20 shadow-md"
                          : "bg-card/70 border-border hover:bg-card hover:border-border/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                                isResolved
                                  ? "bg-emerald-500/15 text-emerald-600"
                                  : t.status === "in_progress"
                                    ? "bg-blue-500/15 text-blue-600"
                                    : "bg-amber-500/15 text-amber-600"
                              }`}
                            >
                              {t.status.replace(/_/g, " ")}
                            </span>

                            {t.order_number ? (
                              <span className="font-mono text-[10px] font-bold text-muted-foreground">
                                #{t.order_number}
                              </span>
                            ) : null}
                          </div>

                          <h2 className="text-xs font-bold text-foreground truncate mt-1">
                            {t.subject}
                          </h2>

                          {t.last_message ? (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {t.last_message_from === "agent" ? "Agent: " : "You: "}
                              {t.last_message}
                            </p>
                          ) : null}
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-mono text-muted-foreground block">
                            {t.updated_at
                              ? new Date(t.updated_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Now"}
                          </span>

                          {unread > 0 ? (
                            <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground shadow-sm mt-1">
                              {unread}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Active Conversation Thread / New Ticket Form */}
          <div className="md:col-span-7 lg:col-span-8">
            {showNewTicketModal ? (
              /* New Ticket Form (§5.1) */
              <div className="rounded-3xl bg-card p-5 sm:p-6 border border-border shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-border/80 pb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquarePlus className="size-5 text-primary" />
                    <div>
                      <h2 className="text-base font-black text-foreground">Open Support Inquiry</h2>
                      <p className="text-xs text-muted-foreground">
                        Direct communication with ForkFleet Operations
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNewTicketModal(false)}
                    className="grid size-8 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateTicket} className="space-y-3.5 text-xs">
                  {/* Subject */}
                  <div className="space-y-1">
                    <label className="label-mono block text-muted-foreground font-bold">
                      Subject / Question *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Where is my delivery, Food item issue, Need driver assistance"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className="h-11 w-full rounded-xl bg-secondary px-3.5 text-xs font-bold ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  {/* Quick Subject Prompts */}
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          setNewSubject(prompt);
                          if (!newMessage) setNewMessage(prompt);
                        }}
                        className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[10px] font-bold text-muted-foreground hover:text-primary hover:bg-secondary border border-border cursor-pointer transition-colors"
                      >
                        + {prompt}
                      </button>
                    ))}
                  </div>

                  {/* Link Order (Optional) */}
                  {orders.length > 0 ? (
                    <div className="space-y-1">
                      <label className="label-mono block text-muted-foreground font-bold">
                        Link Recent Order (Optional)
                      </label>
                      <select
                        aria-label="Link to order"
                        value={selectedOrderId}
                        onChange={(e) => {
                          setSelectedOrderId(e.target.value);
                          const o = orders.find((ord) => ord.id === e.target.value);
                          if (o && !newSubject) {
                            setNewSubject(`Help with order #${o.order_number || o.id}`);
                          }
                        }}
                        className="h-11 w-full rounded-xl bg-secondary px-3 text-xs font-bold ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                      >
                        <option value="">None (General Inquiry)</option>
                        {orders.map((o) => (
                          <option key={o.id} value={o.id}>
                            #{o.order_number || o.id} • {o.restaurant_name} ({o.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {/* Priority & Channel */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="label-mono block text-muted-foreground font-bold">
                        Priority Level
                      </label>
                      <select
                        aria-label="Ticket priority"
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                        className="h-11 w-full rounded-xl bg-secondary px-3 text-xs font-bold ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                      >
                        <option value="low">Low (General question)</option>
                        <option value="medium">Medium (Standard request)</option>
                        <option value="high">High (Active delivery issue)</option>
                        <option value="urgent">Urgent (Immediate assistance)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="label-mono block text-muted-foreground font-bold">
                        Contact Name
                      </label>
                      <input
                        type="text"
                        disabled
                        value={customerName}
                        className="h-11 w-full rounded-xl bg-secondary/50 px-3 text-xs font-bold text-muted-foreground ring-1 ring-border"
                      />
                    </div>
                  </div>

                  {/* Message Body */}
                  <div className="space-y-1">
                    <label className="label-mono block text-muted-foreground font-bold">
                      Message Details *
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Please describe your issue or question in detail..."
                      className="w-full rounded-2xl bg-secondary p-3.5 text-xs ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    />
                  </div>

                  {/* Optional Attachment Link */}
                  <div className="space-y-1">
                    <label className="label-mono block text-muted-foreground font-bold">
                      Attachment URL / Screenshot (Optional)
                    </label>
                    <input
                      type="url"
                      placeholder="https://... image or receipt link"
                      value={newAttachmentUrl}
                      onChange={(e) => setNewAttachmentUrl(e.target.value)}
                      className="h-10 w-full rounded-xl bg-secondary px-3.5 text-xs ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/80">
                    <button
                      type="button"
                      onClick={() => setShowNewTicketModal(false)}
                      className="h-10 px-4 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingTicket}
                      className="h-10 px-6 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider shadow-md hover:bg-primary/90 disabled:opacity-50 cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <Send className="size-3.5" />
                      <span>{creatingTicket ? "Opening Ticket…" : "Submit Ticket"}</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : activeTicketId && activeTicket ? (
              /* Live Chat Thread Conversation View (§5.2 & §5.3) */
              <div className="rounded-3xl bg-card border border-border shadow-xl flex flex-col h-[650px] overflow-hidden">
                {/* Thread Header */}
                <div className="p-4 border-b border-border/80 bg-card/95 backdrop-blur-sm flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => setActiveTicketId(null)}
                      className="md:hidden grid size-8 place-items-center rounded-full bg-secondary text-muted-foreground cursor-pointer"
                    >
                      <ArrowLeft className="size-4" />
                    </button>

                    <div className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary font-black shrink-0">
                      <Headphones className="size-5" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-foreground truncate">
                          {activeTicket.subject}
                        </h2>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                            activeTicket.status === "resolved"
                              ? "bg-emerald-500/15 text-emerald-600"
                              : activeTicket.status === "in_progress"
                                ? "bg-blue-500/15 text-blue-600"
                                : "bg-amber-500/15 text-amber-600"
                          }`}
                        >
                          {activeTicket.status.replace(/_/g, " ")}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {activeTicket.assigned_name
                          ? `Assigned: ${activeTicket.assigned_name}`
                          : "ForkFleet Operations Agent"}
                        {activeTicket.order_number ? ` • Order #${activeTicket.order_number}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {activeTicket.order_id ? (
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: activeTicket.order_id }}
                        className="hidden sm:inline-flex items-center gap-1 rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-primary ring-1 ring-border hover:bg-primary hover:text-primary-foreground transition-colors"
                      >
                        <span>Order #{activeTicket.order_number || activeTicket.order_id}</span>
                      </Link>
                    ) : null}
                  </div>
                </div>

                {/* Messages Feed */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-secondary/30">
                  {/* System Initial Stamp */}
                  <div className="text-center my-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-[10px] font-mono text-muted-foreground border border-border">
                      <Clock className="size-3" />
                      Ticket opened on{" "}
                      {new Date(activeTicket.created_at).toLocaleDateString([], {
                        dateStyle: "medium",
                      })}
                    </span>
                  </div>

                  {messagesLoading ? (
                    <div className="space-y-3 p-4">
                      <div className="h-12 w-2/3 rounded-2xl bg-secondary animate-pulse ml-auto" />
                      <div className="h-12 w-2/3 rounded-2xl bg-secondary animate-pulse" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-10 text-xs text-muted-foreground">
                      No messages yet. Send a message below to reach the support team.
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isCustomer = m.from === "customer";
                      const isSystem = m.from === "system";

                      if (isSystem) {
                        return (
                          <div key={m.id} className="text-center my-2">
                            <span className="rounded-xl bg-muted px-3 py-1 text-[11px] text-muted-foreground font-medium">
                              {m.body}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${
                            isCustomer ? "items-end ml-auto" : "items-start mr-auto"
                          } max-w-[85%] sm:max-w-[75%]`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 px-1">
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {isCustomer ? "You" : m.author_name || "Support Agent"}
                            </span>
                            <span className="text-[9px] font-mono text-muted-foreground/60">
                              {m.at
                                ? new Date(m.at).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : ""}
                            </span>
                          </div>

                          <div
                            className={`rounded-2xl px-4 py-2.5 text-xs shadow-sm leading-relaxed ${
                              isCustomer
                                ? "bg-primary text-primary-foreground rounded-tr-xs"
                                : "bg-card text-foreground border border-border rounded-tl-xs"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{m.body}</p>

                            {m.attachment_url ? (
                              <div className="mt-2 pt-2 border-t border-current/20">
                                <a
                                  href={m.attachment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] underline font-bold"
                                >
                                  <Paperclip className="size-3" />
                                  View attached file
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

                {/* Reopened Banner if Resolved */}
                {activeTicket.status === "resolved" ? (
                  <div className="p-3 bg-emerald-500/10 border-t border-emerald-500/20 text-center text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                    This inquiry is marked resolved. Sending a message below will automatically
                    reopen your thread.
                  </div>
                ) : null}

                {/* Composer Form (§5.2) */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-3 border-t border-border bg-card space-y-2"
                >
                  {showAttachmentInput ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        placeholder="Paste image or document URL..."
                        value={attachmentUrl}
                        onChange={(e) => setAttachmentUrl(e.target.value)}
                        className="h-9 flex-1 rounded-xl bg-secondary px-3 text-xs ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAttachmentInput(false)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}

                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAttachmentInput((v) => !v)}
                      aria-label="Attach URL"
                      className="grid size-11 place-items-center rounded-2xl bg-secondary text-muted-foreground hover:text-foreground ring-1 ring-border cursor-pointer shrink-0"
                    >
                      <Paperclip className="size-4" />
                    </button>

                    <div className="relative flex-1">
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
                        placeholder="Write a message to support agent… (Enter to send)"
                        className="w-full max-h-28 min-h-[44px] rounded-2xl bg-secondary px-4 py-3 text-xs ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={sendingMessage || (!messageText.trim() && !attachmentUrl.trim())}
                      aria-label="Send message"
                      className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-40 transition-all cursor-pointer shrink-0"
                    >
                      <Send className="size-4" />
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* No Active Ticket Selected Placeholder */
              <div className="rounded-3xl bg-secondary/40 border border-border p-12 text-center space-y-4 h-[500px] flex flex-col items-center justify-center">
                <div className="grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary shadow-sm">
                  <MessageSquare className="size-8" />
                </div>
                <div>
                  <h3 className="text-base font-black text-foreground">ForkFleet Customer Care</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mt-1">
                    Select a conversation on the left to review messages, or start a new support
                    inquiry.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(true)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-5 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-md hover:bg-primary/90 transition-all cursor-pointer"
                >
                  <MessageSquarePlus className="size-4" />
                  <span>Start New Inquiry</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <CartBar />
      <BottomNav />
    </div>
  );
}
