import { createServerFn } from "@tanstack/react-start";

/**
 * Server-only Stripe PaymentIntent creation, keyed to one restaurant's own
 * Stripe account.
 *
 * The restaurant's `stripeSecretKey` is read here and nowhere else. It is never
 * returned to the browser — only the PaymentIntent's `client_secret` is, which
 * is what Stripe.js needs to confirm the payment.
 *
 * Two deliberate departures from the handover doc, both forced by this app:
 *
 * 1. Firestore is read over the REST API rather than through `src/lib/firebase.ts`.
 *    That module's `getFirebaseApp()` returns null whenever `window` is undefined,
 *    so the client SDK is unavailable server-side by design.
 *
 * 2. Stripe is called over its REST API rather than through the `stripe` npm
 *    package. The deploy target is a Cloudflare Worker, and keeping this to
 *    `fetch` means there is no importable Stripe server module that could ever be
 *    pulled into the client bundle — a stronger guarantee than the import
 *    discipline the doc asks for.
 */

const FIREBASE_PROJECT_ID =
  (typeof process !== "undefined" ? process.env["FIREBASE_PROJECT_ID"] : undefined) ||
  "e-comm-bd997";

const FIREBASE_API_KEY =
  (typeof process !== "undefined" ? process.env["FIREBASE_API_KEY"] : undefined) ||
  "AIzaSyBCTflur84nQjEc-YdsD_p2sR8eI7BD6nA";

/** Largest order we will ever create an intent for, as a sanity bound (ZAR). */
const MAX_ORDER_AMOUNT = 100_000;

type FirestoreValue = {
  stringValue?: string;
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type CreateIntentInput = { restaurantId: string; amount: number };

export type CreateIntentResult =
  | { ok: true; clientSecret: string; paymentIntentId: string }
  | { ok: false; reason: "not_configured" | "invalid_request" | "stripe_error"; message: string };

/** Walks `fields.a.b.c` through Firestore REST's tagged-value encoding. */
function readNestedString(
  fields: Record<string, FirestoreValue> | undefined,
  path: string[],
  leaf: string,
): string | undefined {
  let cursor = fields;
  for (const key of path) {
    cursor = cursor?.[key]?.mapValue?.fields;
  }
  return cursor?.[leaf]?.stringValue;
}

async function readRestaurantStripeSecret(restaurantId: string): Promise<string | undefined> {
  const url =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/restaurants/${encodeURIComponent(restaurantId)}` +
    `?key=${FIREBASE_API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) return undefined;

  const doc = (await response.json()) as { fields?: Record<string, FirestoreValue> };
  return readNestedString(doc.fields, ["payment_config", "methods", "card"], "stripeSecretKey");
}

export const createPaymentIntent = createServerFn({ method: "POST" })
  .validator((data: CreateIntentInput) => data)
  .handler(async ({ data }): Promise<CreateIntentResult> => {
    const restaurantId = String(data?.restaurantId ?? "").trim();
    const amount = Number(data?.amount);

    if (!restaurantId) {
      return { ok: false, reason: "invalid_request", message: "No restaurant was supplied." };
    }

    // The amount arrives from the browser, per the handover's `{ restaurantId, amount }`
    // contract, so it can only be bounds-checked here — not trusted. See the note in
    // the handover response: the amount should be derived server-side from the order.
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_ORDER_AMOUNT) {
      return { ok: false, reason: "invalid_request", message: "That order total looks wrong." };
    }

    let secretKey: string | undefined;
    try {
      secretKey = await readRestaurantStripeSecret(restaurantId);
    } catch {
      return {
        ok: false,
        reason: "stripe_error",
        message: "Could not reach the payment service. Please try again.",
      };
    }

    if (!secretKey) {
      return {
        ok: false,
        reason: "not_configured",
        message: "This restaurant has not finished setting up card payments.",
      };
    }

    const body = new URLSearchParams({
      // Stripe takes the smallest currency unit.
      amount: String(Math.round(amount * 100)),
      currency: "zar",
      // Cards only, deliberately. The order record is created *after* payment
      // confirms, so a redirect-based method would strand the customer away from
      // this page with money taken and no order written.
      "payment_method_types[0]": "card",
      "metadata[restaurant_id]": restaurantId,
    });

    let payload: { client_secret?: string; id?: string; error?: { message?: string } };
    try {
      const response = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      payload = (await response.json()) as typeof payload;
    } catch {
      return {
        ok: false,
        reason: "stripe_error",
        message: "Could not reach the payment service. Please try again.",
      };
    }

    if (!payload.client_secret || !payload.id) {
      // Stripe's own message is safe to surface; the key is never part of it.
      return {
        ok: false,
        reason: "stripe_error",
        message: payload.error?.message || "The payment could not be started.",
      };
    }

    // Only the client secret crosses back to the browser.
    return { ok: true, clientSecret: payload.client_secret, paymentIntentId: payload.id };
  });

type VerifyInput = { restaurantId: string; paymentIntentId: string };

export type VerifyResult =
  | { ok: true; paid: boolean; cardBrand: string | null; cardLast4: string | null }
  | { ok: false; message: string };

type StripePaymentIntent = {
  status?: string;
  payment_method?: { card?: { brand?: string; last4?: string } } | string;
};

/**
 * Re-reads the PaymentIntent from Stripe after the browser says it confirmed.
 *
 * The browser's own "it succeeded" is not evidence — this is what decides whether
 * the order is written as paid, and it is also where the real card brand and last
 * four digits come from, rather than the hardcoded Visa/4242 this app used to
 * record.
 */
export const verifyPaymentIntent = createServerFn({ method: "POST" })
  .validator((data: VerifyInput) => data)
  .handler(async ({ data }): Promise<VerifyResult> => {
    const restaurantId = String(data?.restaurantId ?? "").trim();
    const paymentIntentId = String(data?.paymentIntentId ?? "").trim();

    if (!restaurantId || !paymentIntentId) {
      return { ok: false, message: "That payment could not be checked." };
    }

    let secretKey: string | undefined;
    try {
      secretKey = await readRestaurantStripeSecret(restaurantId);
    } catch {
      return { ok: false, message: "Could not reach the payment service." };
    }
    if (!secretKey) return { ok: false, message: "Card payments are not set up here." };

    try {
      const response = await fetch(
        `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}` +
          `?expand[]=payment_method`,
        { headers: { Authorization: `Bearer ${secretKey}` } },
      );
      const intent = (await response.json()) as StripePaymentIntent;

      const card =
        typeof intent.payment_method === "object" ? intent.payment_method?.card : undefined;

      return {
        ok: true,
        paid: intent.status === "succeeded",
        cardBrand: card?.brand ?? null,
        cardLast4: card?.last4 ?? null,
      };
    } catch {
      return { ok: false, message: "Could not confirm the payment." };
    }
  });
