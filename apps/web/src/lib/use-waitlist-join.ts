"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { joinWaitlist } from "@/lib/projects-client";

export type WaitlistJoinStatus = "idle" | "joining" | "joined" | "error";

export function useWaitlistJoin() {
  const requestGenerationRef = useRef(0);
  const [status, setStatus] = useState<WaitlistJoinStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(
    () => () => {
      requestGenerationRef.current += 1;
    },
    [],
  );

  const reset = useCallback(() => {
    requestGenerationRef.current += 1;
    setStatus("idle");
    setErrorMessage(null);
  }, []);

  const join = useCallback(async (email?: string) => {
    const requestGeneration = ++requestGenerationRef.current;
    setStatus("joining");
    setErrorMessage(null);

    try {
      await joinWaitlist(email);
      if (requestGeneration !== requestGenerationRef.current) return false;
      setStatus("joined");
      return true;
    } catch (error) {
      if (requestGeneration !== requestGenerationRef.current) return false;
      setErrorMessage(error instanceof Error ? error.message : "Could not join waitlist.");
      setStatus("error");
      return false;
    }
  }, []);

  return { status, errorMessage, join, reset };
}
