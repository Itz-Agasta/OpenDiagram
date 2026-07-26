/**
 * Marketing copy for the plan cards.
 *
 * Deliberately not the source of truth for the credit allowance: it lives in the
 * `plan` table so it can change without a deploy (the signup grant drops 25 -> 15
 * after the launch window), so it is passed in from `GET /api/billing` rather than
 * written here. A literal would go stale the moment the plan row is retuned, on the
 * one number that states what the user is paying for.
 *
 * Other figures below (project count, history retention) are plain copy on purpose:
 * nothing reads them from a table, so there is no second source to drift from. Move
 * one here into the plan table and it has to move out of these strings too.
 */
export const FREE_FEATURES = [
  "AI diagrams to start, then a monthly refresh",
  "Unlimited diagrams with your own AI key",
  "3 projects",
  "7-day version history",
] as const;

export function proFeatures(monthlyCredits: number): readonly string[] {
  return [
    `${monthlyCredits} AI diagrams a month`,
    "Unlimited diagrams with your own AI key",
    "GitHub import and codebase understanding",
    "Unlimited projects",
    "90-day version history",
    "Email support",
  ];
}
