"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SignedOutDialogProps = {
  open: boolean;
  redirectTo: string;
  onContinueAsGuest: () => void;
};

export function SignedOutDialog({ open, redirectTo, onContinueAsGuest }: SignedOutDialogProps) {
  const encodedRedirect = encodeURIComponent(redirectTo);

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="border-od-border-soft bg-white sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="text-od-ink">You’ve been signed out</DialogTitle>
          <DialogDescription className="leading-6 text-od-ink-muted">
            Your account workspace is no longer available in this session. Sign back in, create an
            account, or continue with files stored in this browser.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button asChild>
            <Link href={`/login?redirect=${encodedRedirect}`}>Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/login?tab=signup&redirect=${encodedRedirect}`}>Create an account</Link>
          </Button>
          <Button type="button" variant="ghost" onClick={onContinueAsGuest}>
            Continue as guest
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
