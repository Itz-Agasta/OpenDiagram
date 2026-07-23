import { Suspense } from "react";
import { GitHubImportContent } from "./github-import-content";
import { ImportPageShell } from "./github-import-panels";

export default function GitHubImportPage() {
  return (
    <Suspense fallback={<ImportPageShell />}>
      <GitHubImportContent />
    </Suspense>
  );
}
