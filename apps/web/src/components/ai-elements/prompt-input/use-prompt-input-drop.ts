import type { RefObject } from "react";
import { useEffect } from "react";

export function usePromptInputDrop(
  formRef: RefObject<HTMLFormElement | null>,
  add: (files: File[] | FileList) => void,
  globalDrop: boolean,
) {
  useEffect(() => {
    const target = globalDrop ? document : formRef.current;
    if (!target) return;

    const onDragOver = (event: Event) => {
      const dragEvent = event as DragEvent;
      if (dragEvent.dataTransfer?.types?.includes("Files")) dragEvent.preventDefault();
    };
    const onDrop = (event: Event) => {
      const dragEvent = event as DragEvent;
      if (dragEvent.dataTransfer?.types?.includes("Files")) dragEvent.preventDefault();
      if (dragEvent.dataTransfer?.files?.length) add(dragEvent.dataTransfer.files);
    };

    target.addEventListener("dragover", onDragOver);
    target.addEventListener("drop", onDrop);
    return () => {
      target.removeEventListener("dragover", onDragOver);
      target.removeEventListener("drop", onDrop);
    };
  }, [add, formRef, globalDrop]);
}
