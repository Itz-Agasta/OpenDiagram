"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { joinWaitlist } from "@/lib/projects-client";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "joining" | "joined" | "error">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;

    setStatus("joining");
    try {
      await joinWaitlist(email.trim());
      setStatus("joined");
    } catch {
      setStatus("error");
    }
  }

  if (status === "joined") {
    return (
      <p aria-live="polite" className="text-center text-sm text-white/60">
        You&apos;re on the list. We&apos;ll be in touch.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-center text-sm text-white/50">Try our beta or join the waitlist</p>
      <form onSubmit={handleSubmit} className="flex w-full max-w-[400px] gap-2 max-sm:flex-col">
        <label htmlFor="footer-waitlist-email" className="sr-only">
          Email address
        </label>
        <input
          id="footer-waitlist-email"
          type="email"
          required
          autoComplete="email"
          placeholder="Enter your email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status === "error") setStatus("idle");
          }}
          className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/50"
        />
        <button
          type="submit"
          disabled={status === "joining"}
          className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
        >
          {status === "joining" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {status === "joining" ? "Joining…" : "Join"}
        </button>
      </form>
      {status === "error" && (
        <p aria-live="polite" className="text-center text-xs text-white/50">
          Could not join. Check your email and try again.
        </p>
      )}
    </div>
  );
}
