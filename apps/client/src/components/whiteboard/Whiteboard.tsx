import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import { installHarnessTextMetrics, repairCanvasText } from "#/lib/utils/excalidraw-utils";

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((mod) => ({ default: mod.Excalidraw })),
);

interface WhiteboardProps {
  onAPIReady?: (api: any) => void;
  onChange?: (elements: readonly any[], appState: any, files: any) => void;
  initialData?: any;
}

export function Whiteboard({ onAPIReady, onChange, initialData }: WhiteboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const repairedRef = useRef(false);
  const handleAPI = useCallback(
    (api: any) => {
      setIsMounted(true);
      onAPIReady?.(api);
      if (repairedRef.current) return;
      repairedRef.current = true;
      void repairCanvasText(api);
    },
    [onAPIReady],
  );

  useEffect(() => {
    void installHarnessTextMetrics();
  }, []);

  // Pane resizes reach Excalidraw only as a window resize. Not `api.refresh()`:
  // it recomputes scroll offsets but not canvas size.
  useEffect(() => {
    const container = containerRef.current;
    if (!isMounted || !container) return;

    const observer = new ResizeObserver(() => {
      const canvases = container.querySelectorAll("canvas");
      const canvas = canvases[0];
      if (!canvas) return;
      const width = container.getBoundingClientRect().width;
      if (Math.abs(canvas.getBoundingClientRect().width - width) < 1) return;
      window.dispatchEvent(new Event("resize"));
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isMounted]);

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden relative">
      <Suspense
        fallback={
          <div className="h-full w-full bg-gray-50 flex items-center justify-center">
            <span className="text-gray-400 text-sm font-medium animate-pulse">
              Loading canvas...
            </span>
          </div>
        }
      >
        <Excalidraw
          excalidrawAPI={handleAPI}
          onChange={onChange}
          initialData={{
            ...initialData,
            appState: {
              ...initialData?.appState,
              collaborators: undefined,
              frameRendering: {
                enabled: true,
                name: true,
                outline: true,
                ...initialData?.appState?.frameRendering,
                clip: false,
              },
            },
          }}
        />
      </Suspense>
    </div>
  );
}
