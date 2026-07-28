"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { reconcileCheckout } from "@/lib/billing-client";

/**
 * Closes the gap between paying and being Pro.
 *
 * Dodo appends `subscription_id` and `status` to the `return_url` it sends the
 * buyer back to. Until this existed nothing read them, so entitlement arrived only
 * when the webhook did -- and a lost delivery meant the buyer landed here, still on
 * Free, with no way to tell that anything had gone wrong. That happened in test mode
 * and it cost a duplicate subscription, because the upgrade button was still live.
 *
 * The id is not proof of anything and is not treated as such: the server re-reads
 * the subscription from Dodo and verifies it belongs to the session before writing.
 * The webhook remains the authority for everything after this moment.
 */
/**
 * Statuses that mean this purchase is over, so there is nothing left to wait for.
 * `pending` is deliberately absent -- that one really does resolve on the webhook.
 */
const TERMINAL_STATUSES = new Set(["failed", "expired", "cancelled"]);

/**
 * The message for a terminal status, which is not one message.
 *
 * Only `failed` licenses the claim that no money moved: per Dodo it means the
 * mandate could not be created at all. `cancelled` is the opposite -- it means
 * paid, then cancelled -- and `expired` says nothing either way about the
 * original charge, so telling either of them "no charge was made" would be
 * asserting something we do not know and, for `cancelled`, something false.
 *
 * They all stay terminal, though. Letting `cancelled` fall through to "your
 * upgrade is being confirmed" would leave someone waiting for an upgrade that is
 * never coming, which is the failure this whole branch exists to prevent.
 */
function terminalToast(status: string): { title: string; description: string } {
  if (status === "failed") {
    return {
      title: "That payment didn't go through.",
      description: "No charge was made. You can try again with another payment method.",
    };
  }
  return {
    title: "This subscription isn't active.",
    description: "Check your billing settings, or start a new subscription.",
  };
}

export function CheckoutReturn() {
  const router = useRouter();
  const params = useSearchParams();
  const subscriptionId = params.get("subscription_id");
  // Dodo appends this alongside `subscription_id`, e.g.
  // `?checkout=success&subscription_id=sub_...&status=failed`. It is forgeable, so
  // it is only ever used to make a message *more* pessimistic -- never to grant
  // anything, and never to override what the server actually returned.
  const urlStatus = params.get("status");
  const isCheckoutReturn = params.get("checkout") === "success" || Boolean(subscriptionId);
  // React strict mode mounts effects twice in dev, and the reconcile is a POST.
  // It is idempotent server-side, but firing it twice would double the toast.
  const handled = useRef(false);

  useEffect(() => {
    if (!isCheckoutReturn || handled.current) return;
    handled.current = true;

    // The reconcile is a network round-trip and the user may leave before it
    // lands. Without this, a late `clear()` yanks them back to the dashboard from
    // wherever they navigated to.
    let live = true;

    // Strip the billing params either way, so a refresh or a shared URL doesn't
    // replay this and the address bar doesn't keep a payment id in history.
    const clear = () => {
      if (live) router.replace("/dashboard");
    };

    if (!subscriptionId) {
      // Came back without an id (a one-time payment, or Dodo changed the params).
      // The webhook is still on its way; say nothing rather than something wrong.
      clear();
      return;
    }

    void reconcileCheckout(subscriptionId)
      .then(({ planId, status }) => {
        if (!live) return;
        if (planId === "pro") {
          toast.success("You're on Pro.", { description: "Your credits have been topped up." });
        } else if (TERMINAL_STATUSES.has(status)) {
          // Nothing is coming, so say so. Saying "confirming shortly" here leaves
          // someone waiting for an upgrade that will never arrive.
          const { title, description } = terminalToast(status);
          toast.error(title, { description });
        } else {
          // Still `pending` at Dodo. This one really is a wait -- the webhook
          // finishes it.
          toast.info("Payment received.", {
            description: "Your upgrade is being confirmed and will appear shortly.",
          });
        }
      })
      .catch(() => {
        if (!live) return;
        // The reconcile did not answer, so fall back to what Dodo put in the URL.
        // Measured 2026-07-28: a declined mandate returns here as
        // `...&status=failed`, and this branch used to announce "Payment received"
        // over the top of it -- the same wrong-way-round message §4 of HANDOVER2
        // fixed on the success path, just reached through the error path instead.
        if (urlStatus && TERMINAL_STATUSES.has(urlStatus)) {
          const { title, description } = terminalToast(urlStatus);
          toast.error(title, { description });
          return;
        }
        // Otherwise never claim failure: the money may well have been taken and
        // the webhook may still land. Point at the page that reads the real state.
        toast.info("Payment received.", {
          description: "Your upgrade is being confirmed and will appear shortly.",
        });
      })
      .finally(() => {
        if (!live) return;
        // Refresh on the error path too: the webhook may already have granted Pro
        // before the reconcile failed, and without this the page keeps rendering
        // Free until the user reloads by hand.
        router.refresh();
        clear();
      });

    return () => {
      live = false;
      // Released so a remount can try again. Without this, React Strict Mode's
      // setup/cleanup/setup would leave the only attempt marked dead by the
      // cleanup and the second setup barred by the ref, so a dev checkout return
      // would silently do nothing. Harmless in production, where the effect runs
      // once; the reconcile is idempotent either way.
      handled.current = false;
    };
  }, [isCheckoutReturn, subscriptionId, urlStatus, router]);

  return null;
}
