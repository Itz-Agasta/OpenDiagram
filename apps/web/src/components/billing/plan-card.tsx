import type { ReactNode } from "react";
import { Check } from "lucide-react";

/** Presentational only — every number and action comes from the parent. */
export function PlanCard({
  name,
  price,
  priceSuffix,
  tagline,
  features,
  highlighted = false,
  children,
}: {
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  features: readonly string[];
  /** The tier we want chosen, drawn with a solid border. */
  highlighted?: boolean;
  /** Current-plan text, upgrade button, promo field — whatever this tier needs. */
  children?: ReactNode;
}) {
  return (
    <section
      className={`rounded-xl bg-od-canvas/35 p-6 ${
        highlighted ? "border-2 border-od-ink" : "border border-od-border-soft"
      }`}
    >
      <h2 className={`text-sm font-medium ${highlighted ? "text-od-ink" : "text-od-ink-muted"}`}>
        {name}
      </h2>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-od-ink">
        {price}
        {priceSuffix && (
          <span className="text-base font-normal text-od-ink-muted"> {priceSuffix}</span>
        )}
      </p>
      <p className="mt-1 text-sm text-od-ink-muted">{tagline}</p>

      <ul className="mt-6 space-y-2.5 text-sm">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-od-ink" aria-hidden="true" />
            <span className="text-od-ink-muted">{feature}</span>
          </li>
        ))}
      </ul>

      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}
