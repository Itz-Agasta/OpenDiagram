import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ChangeEvent,
} from "react";
import { ArrowUp, Loader2, Paperclip, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "#/lib/api";
import { aiSettingsQueryOptions, providerModelOptions } from "#/lib/api/settings-client";
import styles from "./PromptInput.module.css";
const SKILLS = [
  { id: "deep-research", name: "Deep Research" },
  { id: "code-review", name: "Code Review" },
  { id: "web-search", name: "Web Search" },
  { id: "summarize", name: "Summarize" },
];

const PROMPT_PLACEHOLDERS = [
  "draw a pub sub architecture",
  "design a multi-tenant SaaS system",
  "map out an event-driven checkout flow",
  "sketch a microservices architecture for a chat app",
  "draw an ER diagram for a blog platform",
  "diagram a CQRS + event sourcing setup",
  "show a load balancer with auto-scaling groups",
  "design an auth flow with OAuth and JWT",
];

const skillName = (id: string) => SKILLS.find((sk) => sk.id === id)?.name ?? id;

const escapeHtml = (str: string) =>
  str.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

export function PromptInput({
  onSubmit,
}: {
  onSubmit?: (
    prompt: string,
    files?: { type: "file"; mediaType: string; filename: string; url: string }[],
    modelId?: string,
    providerId?: string,
  ) => Promise<void> | void;
} = {}) {
  const { data: session } = useQuery(sessionQueryOptions);
  const { data: settings } = useQuery(aiSettingsQueryOptions(!!session?.user));
  const [selectedModel, setSelectedModel] = useState<string>("platform");

  const modelOptions = settings ? providerModelOptions(settings) : [];
  const activeOption = modelOptions.find((o) => o.id === selectedModel);

  useEffect(() => {
    if (modelOptions.length > 0 && selectedModel === "platform") {
      const defaultOpt = modelOptions.find((o) => o.isDefault);
      if (defaultOpt) {
        setSelectedModel(defaultOpt.id);
      }
    }
  }, [modelOptions, selectedModel]);
  const [submitting, setSubmitting] = useState(false);
  const [value, setValue] = useState("");
  const [placeholder] = useState(
    () => PROMPT_PLACEHOLDERS[Math.floor(Math.random() * PROMPT_PLACEHOLDERS.length)],
  );
  // Slash-command palette (typing "/" opens the same skill picker).
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashKeyboard, setSlashKeyboard] = useState(false);

  const [attachments, setAttachments] = useState<
    { id: string; name: string; url: string; file: File }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).filter((file) => file.type.startsWith("image/"));
    const newAttachments = newFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      url: URL.createObjectURL(file),
      file,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((x) => x.id !== id);
    });
  };

  useEffect(() => {
    return () => {
      attachments.forEach((att) => {
        URL.revokeObjectURL(att.url);
      });
    };
  }, []);

  const editorRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const slashOpenRef = useRef(false);
  const slashIndexRef = useRef(0);
  const slashResultsRef = useRef<typeof SKILLS>([]);
  const slashQueryRef = useRef("");
  const slashTokenRef = useRef<{ node: Text; start: number; end: number } | null>(null);
  const ignoreHoverRef = useRef(false);
  const applySlashRef = useRef<(id: string) => void>(() => {});
  const slashKeyLock = useRef(false);

  const hasText = value.trim().length > 0;
  const sendActive = (hasText || attachments.length > 0) && !submitting;
  const slashResults = SKILLS.filter((sk) =>
    sk.name.toLowerCase().includes(slashQuery.toLowerCase()),
  );
  useEffect(() => {
    slashOpenRef.current = slashOpen;
    slashIndexRef.current = slashIndex;
    slashResultsRef.current = slashResults;
  }, [slashOpen, slashIndex, slashResults]);

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
  useEffect(() => {
    applySlashRef.current = applySlash;
  });

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

  const send = async () => {
    if (!sendActive || submitting) return;
    const prompt = value.trim();
    setSubmitting(true);
    try {
      const files: { type: "file"; mediaType: string; filename: string; url: string }[] =
        await Promise.all(
          attachments.map(async (att) => {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (event) => resolve(event.target?.result as string);
              reader.onerror = (error) => reject(error);
              reader.readAsDataURL(att.file);
            });
            return {
              type: "file" as const,
              mediaType: att.file.type,
              filename: att.name,
              url: dataUrl,
            };
          }),
        );

      const editor = editorRef.current;
      if (editor) editor.innerHTML = "";
      setValue("");
      closeSlash();
      if (onSubmit) {
        await onSubmit(prompt, files, activeOption?.modelId, activeOption?.providerId);
      }
      attachments.forEach((att) => URL.revokeObjectURL(att.url));
      setAttachments([]);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  };

  return (
    <div className={styles.wrap}>
      <div ref={frameRef} className={styles.frame}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          multiple
          className="hidden"
        />

        {attachments.length > 0 && (
          <div className={styles.chips}>
            {attachments.map((att) => (
              <div key={att.id} className={styles.chip}>
                <span className={styles.chipIcon}>
                  <img
                    src={att.url}
                    className="w-3.5 h-3.5 rounded-sm object-cover"
                    alt={att.name}
                  />
                </span>
                <span className={styles.chipName}>{att.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className={styles.chipRemove}
                  title="Remove image"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.editorWrap}>
          <div
            ref={editorRef}
            className={styles.field}
            contentEditable={!submitting}
            suppressContentEditableWarning
            role="textbox"
            aria-label={placeholder}
            data-empty={!hasText || undefined}
            data-placeholder={placeholder}
            onInput={onEditorInput}
            onKeyDown={onEditorKeyDown}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
            onBlur={saveSelection}
            onClick={onEditorClick}
          />

          {slashOpen && (
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
          {modelOptions.length > 0 ? (
            <div className="flex items-center text-[11px] text-gray-400 font-semibold font-geist relative bg-gray-50 border border-gray-200/50 rounded px-2 py-0.5 select-none hover:bg-gray-100 hover:text-gray-600 transition cursor-pointer">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-transparent border-none text-gray-400 font-semibold outline-none cursor-pointer hover:text-gray-600 transition pr-3.5"
                style={{
                  fontSize: "11px",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  appearance: "none",
                }}
              >
                <option value="platform" className="text-gray-700 bg-white">
                  Platform (Roxy)
                </option>
                {modelOptions.map((opt) => (
                  <option key={opt.id} value={opt.id} className="text-gray-700 bg-white">
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center">
                <span className="text-[7px]">▼</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-200/60 px-1.5 py-0.5 rounded select-none font-geist">
              Platform (Roxy)
            </div>
          )}

          <div className={styles.right}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={styles.iconBtn}
              title="Attach images"
              disabled={submitting}
              style={{ color: "#a1a1a1" }}
            >
              <Paperclip size={14} />
            </button>
            <button
              type="button"
              className={[styles.iconBtn, styles.send, sendActive && styles.sendActive]
                .filter(Boolean)
                .join(" ")}
              aria-label="Send"
              disabled={!sendActive || submitting}
              onClick={send}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
