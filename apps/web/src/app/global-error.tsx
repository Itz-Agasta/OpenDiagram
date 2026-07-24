"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

// The App Router's last-resort error boundary. Without it, React render errors
// in the root layout and client components never reach Sentry.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* NextError is Next.js's own error page. Its types want a statusCode,
            but the App Router does not expose one for render errors, so 0
            renders the generic message. */}
        <NextError statusCode={0} />
        {/* global-error replaces the root layout, so globals.css never loads
            here — these styles have to be inline. */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button type="button" onClick={() => retry()} style={{ cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
