import { useState, type ClipboardEvent } from "react";
import { ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import type { ChatStatus } from "ai";
import type { ThemeName } from "@OpenDiagram/harness";
import { Attachment, Attachments } from "@/components/ai-elements/attachments";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputAttachments,
  usePromptInputController,
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
import { MAX_PASTE_CHARS, pastedTextFile, shouldAttachPaste } from "@/lib/pasted-text";
import type { ProviderModelOption } from "@/lib/settings-client";
import { PastedTextDialog } from "./PastedTextDialog";

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
          // Text only for now: an image would be added as a chip and then
          // dropped on send, since no route takes image parts yet.
          accept="text/plain"
          // Each chip is re-sent with every later turn, so a few at most.
          maxFiles={3}
          onError={(error) =>
            toast.error(
              error.code === "accept" ? "Only pasted text can be attached for now." : error.message,
            )
          }
          onSubmit={onSubmit}
          className="w-full border-od-border-soft bg-white text-od-ink shadow-[0_18px_80px_-56px_rgba(24,24,21,0.35)]"
        >
          <ComposerAttachments />
          <PromptInputBody>
            <ComposerTextarea />
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

/** Pasted-text chips above the input. Renders nothing until there is one. */
function ComposerAttachments() {
  const attachments = usePromptInputAttachments();
  const { textInput } = usePromptInputController();
  const [open, setOpen] = useState<{ id: string; name: string; text: string } | null>(null);
  if (attachments.files.length === 0) return null;

  return (
    <PromptInputHeader className="px-3 pt-3">
      <Attachments>
        {attachments.files.map((file) => (
          <Attachment
            key={file.id}
            data={file}
            // Still a blob URL here; the composer turns it into a data URL on submit.
            onOpen={() =>
              void fetch(file.url)
                .then((response) => {
                  if (!response.ok) throw new Error(String(response.status));
                  return response.text();
                })
                .then((text) =>
                  setOpen({ id: file.id, name: file.filename ?? "Pasted text", text }),
                )
                .catch(() => toast.error("Could not open that paste."))
            }
            onRemove={() => attachments.remove(file.id)}
          />
        ))}
      </Attachments>
      <PastedTextDialog
        paste={open}
        onClose={() => setOpen(null)}
        onInsertAsText={() => {
          if (!open) return;
          textInput.setInput(textInput.value ? `${textInput.value}\n\n${open.text}` : open.text);
          attachments.remove(open.id);
          setOpen(null);
        }}
      />
    </PromptInputHeader>
  );
}

/**
 * A big paste becomes an attachment chip instead of a wall of composer text,
 * the way Claude and ChatGPT handle it. It is sent as a `text/plain` file part;
 * the server turns that back into text for the model (see `inlineTextFiles`).
 */
function ComposerTextarea() {
  const attachments = usePromptInputAttachments();

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!shouldAttachPaste(text)) return;
    event.preventDefault();
    if (text.length > MAX_PASTE_CHARS) {
      toast.error(
        `That paste is ${text.length.toLocaleString()} characters. The limit is ${MAX_PASTE_CHARS.toLocaleString()}.`,
      );
      return;
    }
    attachments.add([pastedTextFile(text)]);
  };

  return (
    <PromptInputTextarea
      placeholder="Ask, plan, or generate a diagram…"
      // Grows with the text from two lines; capped so the transcript keeps the panel.
      className="max-h-[40vh] min-h-16 resize-none text-od-ink placeholder:text-od-ink-faint"
      onPaste={handlePaste}
    />
  );
}
