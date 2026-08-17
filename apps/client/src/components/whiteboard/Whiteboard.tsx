import { lazy, Suspense } from "react";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((mod) => ({ default: mod.Excalidraw })),
);

export function Whiteboard() {
  return (
    <div className="h-full w-full overflow-hidden relative">
      <Suspense
        fallback={
          <div className="h-full w-full bg-gray-50 flex items-center justify-center">
            <span className="text-gray-400 text-sm font-medium animate-pulse">
              Loading canvas...
            </span>
          </div>
        }
      >
        <Excalidraw />
      </Suspense>
    </div>
  );
}
