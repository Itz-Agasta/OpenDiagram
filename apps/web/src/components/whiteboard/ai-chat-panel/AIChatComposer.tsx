import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { ChatStatus } from "ai";
import type { ThemeName } from "@OpenDiagram/harness";
import type { AiProviderUsage } from "@/lib/ai-provider-usage";
import type { AIChatProviderOption } from "./types";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AIChatComposerProps {
  onStop?: () => void;
  onSubmit: (message: PromptInputMessage) => void | Promise<void>;
  providerUsage: AiProviderUsage | null;
  providerId: string;
  providerOptions: AIChatProviderOption[];
  setProviderId: (providerId: string) => void;
  setTheme: (theme: ThemeName) => void;
  status: ChatStatus;
  theme: ThemeName;
}

export function AIChatComposer({
  onStop,
  onSubmit,
  providerUsage,
  providerId,
  providerOptions,
  setProviderId,
  setTheme,
  status,
  theme,
}: AIChatComposerProps) {
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const selectedProvider = providerOptions.find((option) => option.id === providerId);
  const providerGroups = useMemo(() => {
    const groups = new Map<string, AIChatProviderOption[]>();
    for (const option of providerOptions) {
      const group = option.providerLabel ?? "Other providers";
      const options = groups.get(group) ?? [];
      options.push(option);
      groups.set(group, options);
    }
    return [...groups.entries()];
  }, [providerOptions]);
  const providerLabel = selectedProvider?.providerLabel ?? "Picasso";
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={providerOptions.length === 0}
              className="h-7 max-w-56 min-w-0 justify-between gap-1 px-2 text-xs"
              aria-label="Choose AI provider model"
              onClick={() => setProviderDialogOpen(true)}
            >
              <span className="truncate">{selectedProvider?.label ?? "Picasso"}</span>
              {providerOptions.length > 0 && <ChevronsUpDown aria-hidden="true" />}
            </Button>
            <Dialog open={providerDialogOpen} onOpenChange={setProviderDialogOpen}>
              <DialogContent className="max-w-2xl overflow-hidden p-0">
                <DialogTitle className="sr-only">Choose an AI model</DialogTitle>
                <DialogDescription className="sr-only">
                  Search and choose a model from your configured providers.
                </DialogDescription>
                <Command>
                  <CommandInput placeholder="Search providers and models…" />
                  <CommandList className="max-h-[min(60vh,30rem)]">
                    <CommandEmpty>No matching models found.</CommandEmpty>
                    {providerGroups.map(([group, options]) => (
                      <CommandGroup key={group} heading={group}>
                        {options.map((option) => (
                          <CommandItem
                            key={option.id}
                            value={option.label}
                            onSelect={() => {
                              setProviderId(option.id);
                              setProviderDialogOpen(false);
                            }}
                            className="items-start gap-3 px-3 py-3"
                          >
                            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                              {option.id === providerId && <Check aria-hidden="true" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">
                                {option.modelLabel ?? option.label}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {option.label}
                              </span>
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </DialogContent>
            </Dialog>
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
            <PromptInputSubmit status={status} onStop={onStop} />
          </PromptInputFooter>
        </PromptInput>
      </PromptInputProvider>
    </div>
  );
}
