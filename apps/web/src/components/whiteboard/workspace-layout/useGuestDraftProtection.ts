import { useEffect } from "react";

export function useGuestDraftProtection(
  shouldProtect: boolean,
  setLeavePromptOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (!shouldProtect) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [shouldProtect]);

  useEffect(() => {
    if (!shouldProtect) return;
    window.history.pushState(null, "", window.location.href);
    function warnBeforeSpaBackNavigation() {
      window.history.pushState(null, "", window.location.href);
      setLeavePromptOpen(true);
    }
    window.addEventListener("popstate", warnBeforeSpaBackNavigation);
    return () => window.removeEventListener("popstate", warnBeforeSpaBackNavigation);
  }, [setLeavePromptOpen, shouldProtect]);
}
