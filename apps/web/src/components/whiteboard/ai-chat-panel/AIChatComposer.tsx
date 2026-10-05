import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import type { ChatStatus } from "ai";
import type { ThemeName } from "@OpenDiagram/harness";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { ModelPickerDialog } from "@/components/model-picker-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProviderModelOption } from "@/lib/settings-client";

interface AIChatComposerProps {
  onStop?: () => void;
  onSubmit: (message: PromptInputMessage) => void | Promise<void>;
  providerId: string;
  providerOptions: ProviderModelOption[];
  setProviderId: (providerId: string) => void;
  setTheme: (theme: ThemeName) => void;
  status: ChatStatus;
  theme: ThemeName;
}

export function AIChatComposer({
  onStop,
  onSubmit,
  providerId,
  providerOptions,
  setProviderId,
  setTheme,
  status,
  theme,
}: AIChatComposerProps) {
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const selectedProvider = providerOptions.find((option) => option.id === providerId);

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
              // Full "Provider · Model": the same model can come from two keys.
              title={selectedProvider?.label}
              onClick={() => setProviderDialogOpen(true)}
            >
              <span className="truncate">{selectedProvider?.modelLabel ?? "Default model"}</span>
              {providerOptions.length > 0 && <ChevronsUpDown aria-hidden="true" />}
            </Button>
            <ModelPickerDialog
              open={providerDialogOpen}
              onOpenChange={setProviderDialogOpen}
              options={providerOptions}
              selectedId={providerId}
              onSelect={(option) => setProviderId(option.id)}
            />
            <Select value={theme} onValueChange={(value) => setTheme(value as ThemeName)}>
              <SelectTrigger className="h-7 w-30 text-xs" aria-label="Diagram theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sketch">Sketch</SelectItem>
                <SelectItem value="classic">Classic</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <PromptInputSubmit status={status} onStop={onStop} />
          </PromptInputFooter>
        </PromptInput>
      </PromptInputProvider>
    </div>
  );
}
