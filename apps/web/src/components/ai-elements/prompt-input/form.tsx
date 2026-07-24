"use client";

import { InputGroup } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import type { FileUIPart } from "ai";
import type { FormEvent, FormEventHandler, HTMLAttributes } from "react";
import { useCallback, useRef } from "react";
import { convertBlobUrlToDataUrl } from "./helpers";
import { LocalAttachmentsContext, LocalReferencedSourcesContext } from "./context";
import {
  usePromptInputAttachmentsState,
  useReferencedSourcesState,
  type PromptInputErrorHandler,
} from "./use-prompt-input-attachments";
import { usePromptInputDrop } from "./use-prompt-input-drop";

export interface PromptInputMessage {
  text: string;
  files: FileUIPart[];
}

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit" | "onError"> & {
  accept?: string;
  multiple?: boolean;
  globalDrop?: boolean;
  syncHiddenInput?: boolean;
  maxFiles?: number;
  maxFileSize?: number;
  onError?: PromptInputErrorHandler;
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
};

export const PromptInput = ({
  className,
  accept,
  multiple,
  globalDrop,
  syncHiddenInput,
  maxFiles,
  maxFileSize,
  onError,
  onSubmit,
  children,
  ...props
}: PromptInputProps) => {
  const formRef = useRef<HTMLFormElement | null>(null);
  const attachments = usePromptInputAttachmentsState({
    accept,
    maxFiles,
    maxFileSize,
    onError,
    syncHiddenInput,
  });
  const referencedSources = useReferencedSourcesState();
  usePromptInputDrop(formRef, attachments.add, Boolean(globalDrop));

  const clear = useCallback(() => {
    attachments.clear();
    referencedSources.clear();
  }, [attachments, referencedSources]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    async (event) => {
      event.preventDefault();
      const text = attachments.usingProvider
        ? (attachments.controller?.textInput.value ?? "")
        : String(new FormData(event.currentTarget).get("message") ?? "");

      if (!attachments.usingProvider) event.currentTarget.reset();

      try {
        const files: FileUIPart[] = await Promise.all(
          attachments.files.map(async ({ id: _id, ...item }) => {
            if (!item.url?.startsWith("blob:")) return item;
            const dataUrl = await convertBlobUrlToDataUrl(item.url);
            return { ...item, url: dataUrl ?? item.url };
          }),
        );
        const result = onSubmit({ files, text }, event);
        if (result instanceof Promise) await result;
        clear();
        if (attachments.usingProvider) attachments.controller?.textInput.clear();
      } catch {
        // Preserve input so user can retry.
      }
    },
    [attachments, clear, onSubmit],
  );

  return (
    <LocalAttachmentsContext.Provider value={attachments.context}>
      <LocalReferencedSourcesContext.Provider value={referencedSources.context}>
        <input
          accept={accept}
          aria-label="Upload files"
          className="hidden"
          multiple={multiple}
          onChange={attachments.handleChange}
          ref={attachments.inputRef}
          title="Upload files"
          type="file"
        />
        <form className={cn("w-full", className)} onSubmit={handleSubmit} ref={formRef} {...props}>
          <InputGroup className="overflow-hidden">{children}</InputGroup>
        </form>
      </LocalReferencedSourcesContext.Provider>
    </LocalAttachmentsContext.Provider>
  );
};
