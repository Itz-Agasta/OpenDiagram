import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useKumoToastManager } from "@cloudflare/kumo";
import { reconcileCheckout } from "#/lib/api/billing-client";
import { Route } from "#/routes/app";

const TERMINAL_STATUSES: Record<string, boolean> = {
  failed: true,
  expired: true,
  cancelled: true,
};

function terminalToast(status: string): { title: string; description: string } {
  if (status === "failed") {
    return {
      title: "Payment failed",
      description: "The payment mandate could not be created. No charge was made.",
    };
  }
  return {
    title: "Upgrade incomplete",
    description: "The checkout was not completed and the mandate is no longer active.",
  };
}

export function CheckoutReturn() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toastManager = useKumoToastManager();

  const { checkout, subscription_id: subscriptionId, status: urlStatus } = Route.useSearch();
  const isCheckoutReturn = checkout === "success" || Boolean(subscriptionId);
  const processedId = useRef<string | null>(null);

  useEffect(() => {
    if (!isCheckoutReturn) return;
    if (subscriptionId && processedId.current === subscriptionId) return;
    if (subscriptionId) {
      processedId.current = subscriptionId;
    }

    let live = true;

    const clear = () => {
      if (live) {
        void navigate({ to: "/app", search: {} });
      }
    };

    if (!subscriptionId) {
      clear();
      return;
    }

    void reconcileCheckout(subscriptionId)
      .then(({ planId, status }) => {
        if (!live) return;
        if (planId === "pro") {
          toastManager.add({
            title: "You're on Pro",
            description: "Your credits have been topped up.",
            variant: "success",
          });
        } else if (TERMINAL_STATUSES[status]) {
          const { title, description } = terminalToast(status);
          toastManager.add({
            title,
            description,
            variant: "error",
          });
        } else {
          toastManager.add({
            title: "Payment received",
            description: "Your upgrade is being confirmed and will appear shortly.",
            variant: "success",
          });
        }
      })
      .catch(() => {
        if (!live) return;
        if (urlStatus && TERMINAL_STATUSES[urlStatus]) {
          const { title, description } = terminalToast(urlStatus);
          toastManager.add({
            title,
            description,
            variant: "error",
          });
          return;
        }
        toastManager.add({
          title: "Payment received",
          description: "Your upgrade is being confirmed and will appear shortly.",
          variant: "success",
        });
      })
      .finally(() => {
        if (!live) return;
        void queryClient.invalidateQueries({ queryKey: ["billing", "state"] });
        clear();
      });

    return () => {
      live = false;
    };
  }, [isCheckoutReturn, subscriptionId, urlStatus, navigate, queryClient, toastManager]);

  return null;
}
