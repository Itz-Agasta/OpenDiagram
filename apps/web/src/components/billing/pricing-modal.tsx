"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, ArrowLeft } from "lucide-react";
import {
  getBillingState,
  openBillingPortal,
  startCheckout,
  type BillingState,
} from "@/lib/billing-client";
import { PlanCard } from "@/components/billing/plan-card";
import { FREE_FEATURES, proFeatures } from "@/components/billing/plan-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PricingModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
}

export function PricingModal({
  open,
  onOpenChange,
  title = "Upgrade to Pro",
  description = "Choose a plan to unlock advanced features and raise your usage limits.",
}: PricingModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<BillingState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setIsOpen(open);
  }, [open]);

  useEffect(() => {
    if (!isOpen) return;
    getBillingState()
      .then(setState)
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Failed to load billing.");
      });
  }, [isOpen]);

  async function go(kind: "checkout" | "portal") {
    setActionError(null);
    setPending(kind);
    try {
      window.location.href =
        kind === "checkout"
          ? await startCheckout(discountCode.trim() || undefined)
          : await openBillingPortal();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Something went wrong.");
      setPending(null);
    }
  }

  const handleClose = () => {
    if (onOpenChange) {
      onOpenChange(false);
    } else {
      router.push("/dashboard");
    }
  };

  const isPro = state?.planId === "pro";
  const sub = state?.subscription;
  const allowance = state ? `Your current plan · ${state.credits.limit} credits this period` : "";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(openVal) => {
        setIsOpen(openVal);
        if (!openVal) {
          handleClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl p-6 md:p-8" showCloseButton={true}>
        <DialogHeader className="mb-4">
          <DialogTitle className="text-2xl font-semibold text-od-ink">{title}</DialogTitle>
          <DialogDescription className="text-sm text-od-ink-muted">{description}</DialogDescription>
        </DialogHeader>

        {loadError ? (
          <div className="rounded-lg border border-od-border-soft bg-od-canvas/35 px-4 py-3 text-sm text-od-ink-muted">
            {loadError}
          </div>
        ) : !state ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Skeleton className="h-[340px] rounded-xl" />
            <Skeleton className="h-[340px] rounded-xl" />
          </div>
        ) : !state.billingEnabled ? (
          <div className="rounded-lg border border-od-border-soft bg-od-canvas/35 px-4 py-3 text-sm text-od-ink-muted">
            Billing isn&apos;t configured on this instance. Every account has the Free allowance,
            and your own AI key gives unlimited diagrams.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <PlanCard
              name="Free"
              price="$0"
              tagline="Everything you need to try it properly."
              features={FREE_FEATURES}
            >
              {!isPro && <p className="text-sm font-medium text-od-ink">{allowance}</p>}
            </PlanCard>

            <PlanCard
              name="Pro"
              price="$8"
              priceSuffix="/ month"
              tagline={`${state.proCredits} AI diagrams. Eraser gives you 40 for $20.`}
              features={proFeatures(state.proCredits)}
              highlighted
            >
              {isPro ? (
                <div>
                  <p className="text-sm font-medium text-od-ink">{allowance}</p>
                  {sub && (
                    <p className="mt-1 text-sm text-od-ink-muted">
                      {sub.cancelAtPeriodEnd ? "Access ends" : "Renews"} on{" "}
                      {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    className="mt-4 w-full cursor-pointer"
                    onClick={() => void go("portal")}
                    disabled={pending !== null}
                  >
                    {pending === "portal" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ExternalLink className="size-4" aria-hidden="true" />
                    )}
                    Manage billing
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={discountCode}
                    onChange={(event) => setDiscountCode(event.target.value)}
                    placeholder="Promo code (optional)"
                    aria-label="Promo code"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    className="w-full cursor-pointer"
                    onClick={() => void go("checkout")}
                    disabled={pending !== null}
                  >
                    {pending === "checkout" && (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    )}
                    Upgrade to Pro
                  </Button>
                </div>
              )}
            </PlanCard>
          </div>
        )}

        {actionError && <p className="mt-4 text-sm text-destructive">{actionError}</p>}

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-od-border-soft pt-4">
          <p className="text-xs text-od-ink-muted max-w-[70%] leading-relaxed">
            Payments are handled by Dodo Payments. Cancel any time. Bringing your own AI key is
            always free.
          </p>
          <Button
            variant="ghost"
            onClick={handleClose}
            className="sm:ml-auto cursor-pointer text-xs"
          >
            <ArrowLeft className="mr-2 size-3" />
            Go Back
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
