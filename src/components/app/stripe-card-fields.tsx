import { useEffect, type RefObject } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { createPaymentIntent, verifyPaymentIntent } from "@/lib/stripe-payment.server";

/** Outcome of confirming a card payment, handed back to `submit()`. */
export type CardConfirmResult =
  | { ok: true; paymentIntentId: string; cardBrand: string | null; cardLast4: string | null }
  | { ok: false; message: string };

export type CardConfirm = () => Promise<CardConfirmResult>;

/**
 * Stripe's own card fields, plus the confirm step that runs behind the
 * "Place order" button.
 *
 * `useStripe`/`useElements` only work inside <Elements>, while the submit button
 * lives in the page's action bar, so the confirm function is published upward
 * through a ref instead of being called from here.
 */
export function StripeCardFields({
  confirmRef,
  restaurantId,
  amount,
}: {
  confirmRef: RefObject<CardConfirm | null>;
  restaurantId: string;
  amount: number;
}) {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    if (!stripe || !elements) {
      confirmRef.current = null;
      return;
    }

    confirmRef.current = async () => {
      const { error: validationError } = await elements.submit();
      if (validationError) {
        return { ok: false, message: validationError.message ?? "Please check your card details." };
      }

      // The secret key stays on the server; this only ever returns a client secret.
      const intent = await createPaymentIntent({ data: { restaurantId, amount } });
      if (!intent.ok) return { ok: false, message: intent.message };

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret: intent.clientSecret,
        redirect: "if_required",
      });

      if (error) {
        return { ok: false, message: error.message ?? "Your card was declined." };
      }
      if (!paymentIntent) {
        return { ok: false, message: "The payment did not complete. Please try again." };
      }

      // Ask Stripe directly rather than trusting this result, and take the real
      // brand and last four from the same answer.
      const verified = await verifyPaymentIntent({
        data: { restaurantId, paymentIntentId: paymentIntent.id },
      });

      if (!verified.ok) return { ok: false, message: verified.message };
      if (!verified.paid) {
        return { ok: false, message: "The payment was not completed. Nothing has been charged." };
      }

      return {
        ok: true,
        paymentIntentId: paymentIntent.id,
        cardBrand: verified.cardBrand,
        cardLast4: verified.cardLast4,
      };
    };

    return () => {
      confirmRef.current = null;
    };
  }, [stripe, elements, restaurantId, amount, confirmRef]);

  return <PaymentElement options={{ layout: "tabs" }} />;
}
