"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

// The App Router's last-resort error boundary. Without it, React render errors
// in the root layout and client components never reach Sentry.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
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
      </body>
    </html>
  );
}
