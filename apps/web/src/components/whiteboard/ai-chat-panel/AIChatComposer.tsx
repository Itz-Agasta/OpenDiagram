import type { ChatStatus } from "ai";
import type { ThemeName } from "@OpenDiagram/harness";
import type { AiProviderUsage } from "@/lib/ai-provider-usage";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AIChatComposerProps {
  onSubmit: (message: PromptInputMessage) => void | Promise<void>;
  providerUsage: AiProviderUsage | null;
  setTheme: (theme: ThemeName) => void;
  status: ChatStatus;
  theme: ThemeName;
}

export function AIChatComposer({
  onSubmit,
  providerUsage,
  setTheme,
  status,
  theme,
}: AIChatComposerProps) {
  const providerLabel =
    status === "submitted" || status === "streaming" ? "Picasso is thinking…" : "Picasso";
  const statusColor = providerUsage
    ? "bg-od-green"
    : status === "submitted" || status === "streaming"
      ? "animate-pulse bg-amber-500"
      : "bg-od-ink-faint";

  return (
    <div className="shrink-0 border-t border-od-border-soft bg-od-surface p-3">
      <PromptInputProvider>
        <PromptInput
          onSubmit={onSubmit}
          className="w-full border-od-border-soft bg-white text-od-ink shadow-[0_18px_80px_-56px_rgba(24,24,21,0.35)]"
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Ask, plan, or generate a diagram…"
              className="min-h-32 max-h-40 resize-none text-od-ink placeholder:text-od-ink-faint"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <span className="inline-flex h-7 items-center px-2 text-xs text-od-ink-faint">
              Picasso
            </span>
            <Select value={theme} onValueChange={(value) => setTheme(value as ThemeName)}>
              <SelectTrigger className="h-7 w-30 text-xs" aria-label="Diagram theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sketch">Sketch</SelectItem>
                <SelectItem value="classic">Classic</SelectItem>
              </SelectContent>
            </Select>
            <p
              role="status"
              aria-live="polite"
              className="flex min-w-0 flex-1 items-center justify-end gap-1.5 pr-2 text-right text-xs text-od-ink-faint"
            >
              <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${statusColor}`} />
              <span className="truncate">{providerLabel}</span>
            </p>
            <PromptInputSubmit status={status} />
          </PromptInputFooter>
        </PromptInput>
      </PromptInputProvider>
    </div>
  );
}
