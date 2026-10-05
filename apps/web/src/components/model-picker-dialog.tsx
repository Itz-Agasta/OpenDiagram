"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RecommendedBadge } from "@/components/ui/recommended-badge";
import { isRecommendedModel, type ProviderModelOption } from "@/lib/settings-client";

type ModelPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: ProviderModelOption[];
  selectedId: string;
  onSelect: (option: ProviderModelOption) => void;
};

/** The searchable model list behind both the dashboard and canvas model buttons. */
export function ModelPickerDialog({
  open,
  onOpenChange,
  options,
  selectedId,
  onSelect,
}: ModelPickerDialogProps) {
  const groups = useMemo(() => {
    const byProvider = new Map<string, ProviderModelOption[]>();
    for (const option of options) {
      byProvider.set(option.providerLabel, [
        ...(byProvider.get(option.providerLabel) ?? []),
        option,
      ]);
    }
    return [...byProvider.entries()];
  }, [options]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Choose an AI model</DialogTitle>
        <DialogDescription className="sr-only">
          Search and choose a model from your configured providers.
        </DialogDescription>
        <Command>
          <CommandInput placeholder="Search providers and models…" />
          <CommandList className="max-h-[min(60vh,30rem)]">
            <CommandEmpty>No matching models found.</CommandEmpty>
            {groups.map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((option) => (
                  <CommandItem
                    key={option.id}
                    // Provider too, so typing "OpenDiagram" finds Standard.
                    value={`${option.providerLabel} ${option.label}`}
                    onSelect={() => {
                      onSelect(option);
                      onOpenChange(false);
                    }}
                    className="items-start gap-3 px-3 py-3"
                  >
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                      {option.id === selectedId && <Check aria-hidden="true" />}
                    </span>
                    {/* div, not span: RecommendedBadge renders a div. */}
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{option.modelLabel}</span>
                        {option.modelId && isRecommendedModel(option.modelId, option.modelLabel) ? (
                          <RecommendedBadge />
                        ) : null}
                      </div>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {option.hint ?? option.label}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
