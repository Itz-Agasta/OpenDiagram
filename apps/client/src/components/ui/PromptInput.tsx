import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import styles from "./PromptInput.module.css";

const ENHANCED =
  "This is an example prompt — rewritten to be clear and specific: state the goal, add the relevant context and constraints, define the expected output format and tone, and note any assumptions. Ask a clarifying question first if key details are missing.";

/**
 * Turn a raw prompt into an improved one. This is the integration seam:
 * replace the mock body with a real request to your model/API. The component
 * only depends on it resolving to the enhanced prompt string (and honouring
 * the AbortSignal so an in-flight call can be cancelled).
 */
async function mockEnhance(_prompt: string, signal?: AbortSignal): Promise<string> {
  // --- MOCK (demo only) — remove when wiring a real backend ----------
  await new Promise((r) => setTimeout(r, 2500));
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return ENHANCED;
  // --- REAL API (example) --------------------------------------------
  // const res = await fetch("/api/enhance", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ prompt }),
  //   signal,
  // });
  // if (!res.ok) throw new Error("Enhance request failed");
  // return (await res.json()).prompt as string;
}

const SKILLS = [
  { id: "deep-research", name: "Deep Research" },
  { id: "code-review", name: "Code Review" },
  { id: "web-search", name: "Web Search" },
  { id: "summarize", name: "Summarize" },
];

const skillName = (id: string) => SKILLS.find((sk) => sk.id === id)?.name ?? id;

const escapeHtml = (str: string) =>
  str.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

type Phase = "idle" | "enhancing" | "enhanced";

export function PromptInput({
  onEnhance = mockEnhance,
}: {
  onEnhance?: (prompt: string, signal?: AbortSignal) => Promise<string>;
} = {}) {
  // `value` mirrors the editor's plain text (skill pills contribute their
  // label), so it drives the empty/placeholder + enhance/send logic.
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");

  // Keep the enhance pill mounted through a short exit so it leaves the same
  // soft way it arrives (mirrors pi-pill-in / pi-pill-out).
  const [pillMounted, setPillMounted] = useState(false);
  const [pillExiting, setPillExiting] = useState(false);

  // Slash-command palette (typing "/" opens the same skill picker).
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashKeyboard, setSlashKeyboard] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const preEnhanceHTML = useRef("");
  const pendingHTML = useRef<string | null>(null);
  // height of the frame captured right before an enhance/revert swap, so the
  // new height can be animated from it (FLIP) instead of jumping.
  const flipFrom = useRef<number | null>(null);
  const savedRange = useRef<Range | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const slashOpenRef = useRef(false);
  const slashIndexRef = useRef(0);
  const slashResultsRef = useRef<typeof SKILLS>([]);
  const slashQueryRef = useRef("");
  const slashTokenRef = useRef<{ node: Text; start: number; end: number } | null>(null);
  const ignoreHoverRef = useRef(false);
  const applySlashRef = useRef<(id: string) => void>(() => {});
  const slashKeyLock = useRef(false);

  const hasText = value.trim().length > 0;
  const enhancing = phase === "enhancing";
  const sendActive = hasText && !enhancing;
  const showPill = hasText && !enhancing;
  const slashResults = SKILLS.filter((sk) =>
    sk.name.toLowerCase().includes(slashQuery.toLowerCase()),
  );
  slashOpenRef.current = slashOpen;
  slashIndexRef.current = slashIndex;
  slashResultsRef.current = slashResults;

  // Focus the editor and drop the caret at the very end of its content.
  const focusEnd = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    savedRange.current = range.cloneRange();
  };

  const syncFromEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    setValue(editor.textContent ?? "");
    // Mark pills that sit at the very start (nothing but whitespace before them)
    // so CSS can drop their left margin — :first-child can't see text nodes.
    editor.querySelectorAll<HTMLElement>("." + styles.skillPill).forEach((pill) => {
      let atStart = true;
      for (let n = pill.previousSibling; n; n = n.previousSibling) {
        if (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() === "") continue;
        atStart = false;
        break;
      }
      pill.toggleAttribute("data-start", atStart);
    });
  };

  // Remember the last caret position so the "+" menu can insert at it even
  // after the editor loses focus.
  const saveSelection = () => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor && editor.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const closeSlash = () => {
    setSlashOpen(false);
    setSlashQuery("");
    setSlashIndex(0);
    setSlashKeyboard(false);
    slashQueryRef.current = "";
    slashTokenRef.current = null;
    ignoreHoverRef.current = false;
  };

  // Build a skill pill node (contenteditable=false so it deletes as a unit).
  const buildPill = (id: string) => {
    const name = skillName(id);
    const el = document.createElement("span");
    el.className = styles.skillPill;
    el.setAttribute("contenteditable", "false");
    el.dataset.skill = id;
    el.innerHTML =
      '<span class="' +
      styles.skillPillLabel +
      '">/' +
      escapeHtml(name) +
      "</span>" +
      '<button type="button" class="' +
      styles.skillPillX +
      '" data-remove="1" aria-label="Remove ' +
      escapeHtml(name) +
      '"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    return el;
  };

  // Replace `range` with a pill + trailing space, then park the caret after it.
  const insertPillOverRange = (range: Range, id: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    range.deleteContents();
    const pill = buildPill(id);
    range.insertNode(pill);
    const space = document.createTextNode("\u00A0");
    pill.parentNode?.insertBefore(space, pill.nextSibling);
    const rangeAfter = document.createRange();
    rangeAfter.setStartAfter(space);
    rangeAfter.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(rangeAfter);
    editor.focus();
    savedRange.current = rangeAfter.cloneRange();
    syncFromEditor();
  };

  // Insert from the "+" menu: use the current/last caret, else append at end.

  // Insert from a "/" command: swallow the typed "/query" then drop the pill.
  const applySlash = (id: string) => {
    const editor = editorRef.current;
    if (!editor) {
      closeSlash();
      return;
    }
    let range: Range | null = null;
    const token = slashTokenRef.current;
    if (
      token &&
      token.node.isConnected &&
      editor.contains(token.node) &&
      token.end <= (token.node.textContent?.length ?? 0)
    ) {
      range = document.createRange();
      range.setStart(token.node, token.start);
      range.setEnd(token.node, token.end);
    } else {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const caret = sel.getRangeAt(0);
        range = caret.cloneRange();
        const node = caret.startContainer;
        if (node.nodeType === Node.TEXT_NODE && editor.contains(node)) {
          const before = (node.textContent ?? "").slice(0, caret.startOffset);
          const m = before.match(/\/([^\s/]*)$/);
          if (m) {
            range = document.createRange();
            range.setStart(node, caret.startOffset - m[0].length);
            range.setEnd(node, caret.startOffset);
          }
        }
      }
    }
    if (!range) {
      closeSlash();
      return;
    }
    insertPillOverRange(range, id);
    closeSlash();
  };
  applySlashRef.current = applySlash;

  // Open the palette when the caret sits right after a "/" token.
  const detectSlash = () => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || !sel.rangeCount || !sel.isCollapsed) return closeSlash();
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) return closeSlash();
    const before = (node.textContent ?? "").slice(0, range.startOffset);
    const m = before.match(/(?:^|\s)\/([^\s/]*)$/);
    if (!m) return closeSlash();
    const q = m[1];
    const slashStart = before.length - m[1].length - 1;
    slashTokenRef.current = {
      node: node as Text,
      start: slashStart,
      end: range.startOffset,
    };
    if (q !== slashQueryRef.current) {
      slashQueryRef.current = q;
      setSlashIndex(0);
    }
    setSlashQuery(q);
    setSlashOpen(true);
  };

  const onEditorInput = () => {
    syncFromEditor();
    if (phase === "enhanced") setPhase("idle");
    detectSlash();
  };

  const moveSlash = (delta: number) => {
    const results = slashResultsRef.current;
    if (!results.length) return;
    ignoreHoverRef.current = true;
    setSlashKeyboard(true);
    setSlashIndex((i) => (i + delta + results.length * 10) % results.length);
  };

  const handleSlashKey = (e: {
    key: string;
    preventDefault: () => void;
    stopPropagation?: () => void;
  }) => {
    const results = slashResultsRef.current;
    if (!slashOpenRef.current || !results.length) return false;
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "Enter" &&
      e.key !== "Tab" &&
      e.key !== "Escape"
    ) {
      return false;
    }
    e.preventDefault();
    e.stopPropagation?.();
    if (slashKeyLock.current) return true;
    slashKeyLock.current = true;
    queueMicrotask(() => {
      slashKeyLock.current = false;
    });
    if (e.key === "ArrowDown") {
      moveSlash(1);
      return true;
    }
    if (e.key === "ArrowUp") {
      moveSlash(-1);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      applySlashRef.current((results[slashIndexRef.current] ?? results[0]).id);
      return true;
    }
    if (e.key === "Escape") {
      closeSlash();
      return true;
    }
    return false;
  };

  const onEditorKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (handleSlashKey(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  useEffect(() => {
    if (!slashOpen) return;
    const onKey = (e: KeyboardEvent) => {
      handleSlashKey(e);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [slashOpen]);

  useEffect(() => {
    if (!slashOpen || !slashResults.length) return;
    if (slashIndex >= slashResults.length) setSlashIndex(0);
  }, [slashOpen, slashResults.length, slashIndex]);

  const onEditorClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const remove = (e.target as HTMLElement).closest("[data-remove]");
    if (remove) {
      e.preventDefault();
      const pill = remove.closest<HTMLElement>("[data-skill]");
      if (pill) {
        // the separator space we inserted right after the pill — drop it too
        // on removal so leftover spaces can't accumulate and shift the next
        // pill out of alignment.
        const sep = pill.nextSibling;
        // collapse the pill's footprint (width + margins + padding) in sync with
        // the fade so following text slides in smoothly instead of snapping.
        const w = pill.getBoundingClientRect().width;
        pill.style.maxWidth = `${w}px`;
        pill.style.overflow = "hidden";
        pill.style.whiteSpace = "nowrap";
        void pill.offsetWidth;
        pill.style.transition =
          "max-width 180ms cubic-bezier(0.22,1,0.36,1), margin 180ms cubic-bezier(0.22,1,0.36,1), padding 180ms cubic-bezier(0.22,1,0.36,1)";
        // leave the same soft way the enhance pill arrives, then drop the node
        pill.setAttribute("data-exit", "");
        pill.style.maxWidth = "0px";
        pill.style.marginLeft = "0px";
        pill.style.marginRight = "0px";
        pill.style.paddingLeft = "0px";
        pill.style.paddingRight = "0px";
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          if (sep && sep.nodeType === Node.TEXT_NODE && sep.textContent?.startsWith("\u00A0")) {
            const rest = sep.textContent.slice(1);
            if (rest) sep.textContent = rest;
            else sep.parentNode?.removeChild(sep);
          }
          pill.remove();
          syncFromEditor();
          editorRef.current?.focus();
        };
        pill.addEventListener("animationend", finish, { once: true });
        setTimeout(finish, 220);
      }
      return;
    }
    saveSelection();
  };

  // After an enhance/revert the editor is shown editable again — write the
  // pending HTML into it (enhanced text, or the restored original w/ pills).
  useLayoutEffect(() => {
    if (enhancing || pendingHTML.current === null) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = pendingHTML.current;
    pendingHTML.current = null;
    syncFromEditor();
    requestAnimationFrame(focusEnd);

    // Animate the frame from its previous height to the new one so the input
    // doesn't jump when the enhanced/original text changes its size.
    const frame = frameRef.current;
    const from = flipFrom.current;
    flipFrom.current = null;
    if (!frame || from === null) return;
    const to = frame.offsetHeight;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from === to) return;
    frame.style.height = from + "px";
    frame.style.overflow = "hidden";
    void frame.offsetHeight; // force reflow so the start height is committed
    frame.style.transition = "height 200ms cubic-bezier(0.22, 1, 0.36, 1)";
    frame.style.height = to + "px";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      frame.style.transition = "";
      frame.style.height = "";
      frame.style.overflow = "";
      frame.removeEventListener("transitionend", finish);
    };
    frame.addEventListener("transitionend", finish);
    setTimeout(finish, 260);
  }, [phase, enhancing]);

  // Drive the enhance pill's mount/exit. It enters when there's text; when it
  // should leave it plays the exit animation first — except when handing over
  // to the spinner (enhancing), where it swaps instantly.
  useEffect(() => {
    if (showPill) {
      setPillMounted(true);
      setPillExiting(false);
      return;
    }
    if (!pillMounted) return;
    if (enhancing) {
      setPillMounted(false);
      setPillExiting(false);
      return;
    }
    setPillExiting(true);
    const t = setTimeout(() => {
      setPillMounted(false);
      setPillExiting(false);
    }, 200);
    return () => clearTimeout(t);
  }, [showPill, enhancing, pillMounted]);

  // Cancel any in-flight enhance on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runEnhance = async () => {
    if (!hasText || enhancing) return;
    preEnhanceHTML.current = editorRef.current?.innerHTML ?? "";
    setPhase("enhancing");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const result = await onEnhance(value, ac.signal);
      if (ac.signal.aborted) return;
      pendingHTML.current = escapeHtml(result);
      flipFrom.current = frameRef.current?.offsetHeight ?? null;
      setPhase("enhanced");
    } catch {
      // Restore the untouched prompt if the call fails/aborts.
      if (ac.signal.aborted) return;
      pendingHTML.current = preEnhanceHTML.current;
      setPhase("idle");
    }
  };

  const revert = () => {
    abortRef.current?.abort();
    pendingHTML.current = preEnhanceHTML.current;
    flipFrom.current = frameRef.current?.offsetHeight ?? null;
    setPhase("idle");
  };

  const send = () => {
    if (!sendActive) return;
    const editor = editorRef.current;
    if (editor) editor.innerHTML = "";
    setValue("");
    setPhase("idle");
    closeSlash();
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  return (
    <div className={styles.wrap}>
      <div ref={frameRef} className={styles.frame} data-enhancing={enhancing || undefined}>
        <div className={styles.editorWrap}>
          {enhancing ? (
            <div className={styles.enhancingText} aria-live="polite">
              {value}
            </div>
          ) : (
            <div
              ref={editorRef}
              className={styles.field}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="Ask AI Agent"
              data-empty={!hasText || undefined}
              data-placeholder="Ask AI Agent"
              onInput={onEditorInput}
              onKeyDown={onEditorKeyDown}
              onKeyUp={saveSelection}
              onMouseUp={saveSelection}
              onBlur={saveSelection}
              onClick={onEditorClick}
            />
          )}

          {slashOpen && !enhancing && (
            <div
              className={styles.slashMenu}
              role="listbox"
              aria-label="Skills"
              data-keyboard={slashKeyboard || undefined}
              onMouseMove={() => {
                ignoreHoverRef.current = false;
                if (slashKeyboard) setSlashKeyboard(false);
              }}
            >
              <div className={styles.slashLabel}>Skills</div>
              {slashResults.length ? (
                slashResults.map((sk, i) => (
                  <button
                    key={sk.id}
                    type="button"
                    role="option"
                    aria-selected={i === slashIndex}
                    className={[styles.menuItem, i === slashIndex && styles.menuItemActive]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => {
                      if (ignoreHoverRef.current) return;
                      setSlashIndex(i);
                    }}
                    onClick={() => applySlash(sk.id)}
                  >
                    <span className={styles.menuName}>{sk.name}</span>
                  </button>
                ))
              ) : (
                <div className={styles.slashEmpty}>No matching skills</div>
              )}
            </div>
          )}
        </div>

        <div className={styles.row}>
          <div className="flex items-center text-[11px] text-gray-400 font-semibold select-none font-geist">
            Picasso
          </div>

          <div className={styles.right}>
            {enhancing ? (
              <span
                className={[styles.iconBtn, styles.spinnerBtn].join(" ")}
                aria-label="Enhancing prompt"
              >
                <Loader2 size={14} className={styles.spinner} />
              </span>
            ) : (
              pillMounted && (
                <button
                  type="button"
                  className={[styles.pill, pillExiting && styles.pillExit]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={phase === "enhanced" ? revert : runEnhance}
                >
                  {phase === "enhanced" ? "Revert" : "Enhance Prompt"}
                </button>
              )
            )}
            <button
              type="button"
              className={[styles.iconBtn, styles.send, sendActive && styles.sendActive]
                .filter(Boolean)
                .join(" ")}
              aria-label="Send"
              disabled={!sendActive}
              onClick={send}
            >
              <ArrowUp size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
