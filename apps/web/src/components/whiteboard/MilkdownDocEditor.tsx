"use client";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

import { Crepe } from "@milkdown/crepe";
import { editorViewCtx, parserCtx } from "@milkdown/kit/core";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { Slice } from "@milkdown/kit/prose/model";
import { Selection } from "@milkdown/kit/prose/state";
import throttle from "lodash.throttle";
import { useCallback, useLayoutEffect, useRef } from "react";

type CrepeAPI = {
  update: (markdown: string) => void;
};

type MilkdownDocEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function MilkdownDocEditor({ value, onChange }: MilkdownDocEditorProps) {
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const crepeAPIRef = useRef<CrepeAPI>({ update: () => undefined });
  onChangeRef.current = onChange;

  const handleMilkdownChange = useCallback((markdown: string) => {
    onChangeRef.current(markdown);
  }, []);

  const setCrepeAPI = useCallback((api: CrepeAPI) => {
    crepeAPIRef.current = api;
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-hidden border-y border-gray-300 bg-white">
      <style>{`
        .crepe .milkdown {
          --crepe-font-default: Inter, Arial, sans-serif;
          --crepe-font-title: Inter, Arial, sans-serif;
          --crepe-font-code: 'JetBrains Mono', Menlo, monospace;
          min-height: 100%;
        }
        .crepe .milkdown .ProseMirror {
          max-width: 720px;
          min-height: 100%;
          margin: 0 auto;
          padding: 48px 64px;
        }
        .crepe .milkdown .ProseMirror p {
          font-size: 16px;
          line-height: 1.5;
          font-weight: 400;
          letter-spacing: normal;
        }
        .crepe .milkdown .ProseMirror h1 {
          font-size: 40px;
          line-height: 1.2;
          font-weight: 600;
          letter-spacing: -0.02em;
          margin-top: 32px;
        }
        .crepe .milkdown .ProseMirror h2 {
          font-size: 24px;
          line-height: 1.3;
          font-weight: 500;
          letter-spacing: -0.01em;
          margin-top: 28px;
        }
        .crepe .milkdown .ProseMirror h3 {
          font-size: 20px;
          line-height: 1.4;
          font-weight: 500;
          letter-spacing: -0.01em;
          margin-top: 24px;
        }
      `}</style>
      <CrepePane
        initialValue={initialValueRef.current}
        onChange={handleMilkdownChange}
        setAPI={setCrepeAPI}
      />
    </div>
  );
}

function CrepePane({
  initialValue,
  onChange,
  setAPI,
}: {
  initialValue: string;
  onChange: (value: string) => void;
  setAPI: (api: CrepeAPI) => void;
}) {
  const crepeRef = useRef<Crepe | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useLayoutEffect(() => {
    if (!rootRef.current || loadingRef.current) return;

    let mounted = true;
    loadingRef.current = true;
    const crepe = new Crepe({
      defaultValue: initialValue,
      root: rootRef.current,
    });

    crepe.editor
      .config((ctx) => {
        ctx.get(listenerCtx).markdownUpdated(
          throttle((_, markdown) => {
            onChange(markdown);
          }, 200),
        );
      })
      .use(listener);

    crepe
      .create()
      .then(() => {
        if (!mounted) return;
        crepeRef.current = crepe;
      })
      .catch((error) => {
        console.error("Failed to initialize Milkdown editor:", error);
      })
      .finally(() => {
        loadingRef.current = false;
        if (!mounted) void crepe.destroy();
      });

    setAPI({
      update: (markdown: string) => {
        const current = crepeRef.current;
        if (!current || current.getMarkdown() === markdown) return;
        current.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const parser = ctx.get(parserCtx);
          const doc = parser(markdown);
          if (!doc) return;
          const selection = view.state.selection;
          let tr = view.state.tr.replace(
            0,
            view.state.doc.content.size,
            new Slice(doc.content, 0, 0),
          );
          const safeFrom = Math.max(0, Math.min(selection.from, doc.content.size - 2));
          tr = tr.setSelection(Selection.near(tr.doc.resolve(safeFrom)));
          view.dispatch(tr);
        });
      },
    });

    return () => {
      mounted = false;
      loadingRef.current = false;
      crepeRef.current = null;
      void crepe.destroy();
      setAPI({ update: () => undefined });
    };
  }, [initialValue, onChange, setAPI]);

  return (
    <div
      className="crepe flex h-full min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
      ref={rootRef}
    />
  );
}
