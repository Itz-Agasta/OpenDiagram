/**
 * Marketing copy for the plan cards.
 *
 * Deliberately not the source of truth for any number: the real limits live in the
 * `plan` table so they can change without a deploy (the signup grant drops 25 -> 15
 * after the launch window). Anything the product *enforces* is read from
 * `GET /api/billing`; these strings only describe the shape of each tier.
 */
export const FREE_FEATURES = [
  "AI diagrams to start, then a monthly refresh",
  "Unlimited diagrams with your own AI key",
  "3 projects",
  "7-day version history",
] as const;

export const PRO_FEATURES = [
  "150 AI diagrams a month",
  "Unlimited diagrams with your own AI key",
  "GitHub import and codebase understanding",
  "Unlimited projects",
  "90-day version history",
  "Email support",
] as const;
