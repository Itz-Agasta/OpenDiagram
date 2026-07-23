"use client";

import type { FileUIPart, SourceDocumentUIPart } from "ai";
import { nanoid } from "nanoid";
import type { ChangeEventHandler } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useOptionalPromptInputController,
  type AttachmentsContext,
  type ReferencedSourcesContext,
} from "./context";

export type PromptInputErrorHandler = (error: {
  code: "max_files" | "max_file_size" | "accept";
  message: string;
}) => void;

type AttachmentOptions = {
  accept?: string;
  maxFiles?: number;
  maxFileSize?: number;
  onError?: PromptInputErrorHandler;
  syncHiddenInput?: boolean;
};

function acceptedFiles(files: File[], options: AttachmentOptions) {
  const patterns =
    options.accept
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  const accepted = files.filter(
    (file) =>
      patterns.length === 0 ||
      patterns.some((pattern) =>
        pattern.startsWith(".")
          ? file.name.toLowerCase().endsWith(pattern.toLowerCase())
          : pattern.endsWith("/*")
            ? file.type.startsWith(pattern.slice(0, -1))
            : file.type === pattern,
      ),
  );
  if (files.length && accepted.length === 0) {
    options.onError?.({ code: "accept", message: "No files match the accepted types." });
    return [];
  }

  const sized = accepted.filter((file) => !options.maxFileSize || file.size <= options.maxFileSize);
  if (accepted.length && sized.length === 0) {
    options.onError?.({ code: "max_file_size", message: "All files exceed the maximum size." });
  }
  return sized;
}

function capFiles(files: File[], currentCount: number, options: AttachmentOptions) {
  if (typeof options.maxFiles !== "number") return files;
  const capacity = Math.max(0, options.maxFiles - currentCount);
  if (files.length > capacity) {
    options.onError?.({ code: "max_files", message: "Too many files. Some were not added." });
  }
  return files.slice(0, capacity);
}

export function usePromptInputAttachmentsState(options: AttachmentOptions) {
  const controller = useOptionalPromptInputController();
  const usingProvider = Boolean(controller);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localFiles, setLocalFiles] = useState<(FileUIPart & { id: string })[]>([]);
  const files = controller?.attachments.files ?? localFiles;
  const filesRef = useRef(files);
  const pendingProviderCountRef = useRef(0);

  useEffect(() => {
    filesRef.current = files;
    pendingProviderCountRef.current = 0;
  }, [files]);

  const addLocal = useCallback(
    (fileList: File[] | FileList) => {
      setLocalFiles((current) => {
        const accepted = acceptedFiles([...fileList], options);
        const nextFiles = capFiles(accepted, current.length, options).map((file) => ({
          filename: file.name,
          id: nanoid(),
          mediaType: file.type,
          type: "file" as const,
          url: URL.createObjectURL(file),
        }));
        return [...current, ...nextFiles];
      });
    },
    [options],
  );

  const addWithProvider = useCallback(
    (fileList: File[] | FileList) => {
      const accepted = acceptedFiles([...fileList], options);
      const capped = capFiles(
        accepted,
        filesRef.current.length + pendingProviderCountRef.current,
        options,
      );
      if (capped.length) {
        pendingProviderCountRef.current += capped.length;
        controller?.attachments.add(capped);
      }
    },
    [controller, files.length, options],
  );

  const removeLocal = useCallback((id: string) => {
    setLocalFiles((current) => {
      const found = current.find((file) => file.id === id);
      if (found?.url) URL.revokeObjectURL(found.url);
      return current.filter((file) => file.id !== id);
    });
  }, []);

  const clearLocal = useCallback(() => {
    setLocalFiles((current) => {
      for (const file of current) if (file.url) URL.revokeObjectURL(file.url);
      return [];
    });
  }, []);

  const add = usingProvider ? addWithProvider : addLocal;
  const remove = controller?.attachments.remove ?? removeLocal;
  const clear = controller?.attachments.clear ?? clearLocal;
  const openFileDialog =
    controller?.attachments.openFileDialog ?? (() => inputRef.current?.click());

  useEffect(() => {
    if (controller) controller.__registerFileInput(inputRef, () => inputRef.current?.click());
  }, [controller]);

  useEffect(() => {
    if (options.syncHiddenInput && files.length === 0 && inputRef.current)
      inputRef.current.value = "";
  }, [files.length, options.syncHiddenInput]);

  useEffect(
    () => () => {
      if (!usingProvider)
        for (const file of filesRef.current) if (file.url) URL.revokeObjectURL(file.url);
    },
    [usingProvider],
  );

  const handleChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      if (event.currentTarget.files) add(event.currentTarget.files);
      event.currentTarget.value = "";
    },
    [add],
  );

  const context = useMemo<AttachmentsContext>(
    () => ({
      add,
      clear,
      fileInputRef: inputRef,
      files,
      openFileDialog,
      remove,
    }),
    [add, clear, files, openFileDialog, remove],
  );

  return { add, clear, context, controller, files, handleChange, inputRef, usingProvider };
}

export function useReferencedSourcesState() {
  const [sources, setSources] = useState<(SourceDocumentUIPart & { id: string })[]>([]);
  const clear = useCallback(() => setSources([]), []);
  const context = useMemo<ReferencedSourcesContext>(
    () => ({
      add: (incoming) => {
        const items = Array.isArray(incoming) ? incoming : [incoming];
        setSources((current) => [...current, ...items.map((item) => ({ ...item, id: nanoid() }))]);
      },
      clear,
      remove: (id) => setSources((current) => current.filter((source) => source.id !== id)),
      sources,
    }),
    [clear, sources],
  );
  return { clear, context };
}
