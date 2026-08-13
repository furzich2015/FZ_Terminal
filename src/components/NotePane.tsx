import { useLayoutEffect, useRef, useState } from "react";
import { Plus, StickyNote } from "lucide-react";
import { sanitizeNoteText } from "../lib/noteText";

interface NotePaneProps {
  initialContent: string;
  initialScrollTop?: number;
  onChange: (value: string) => void;
  onScrollChange?: (value: number) => void;
  onNewTab?: () => void;
}

export function NotePane({
  initialContent,
  initialScrollTop = 0,
  onChange,
  onScrollChange,
  onNewTab,
}: NotePaneProps) {
  const [content, setContent] = useState(() =>
    sanitizeNoteText(initialContent),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const latestScrollTopRef = useRef(initialScrollTop);
  const onScrollChangeRef = useRef(onScrollChange);
  const lineCount = Math.max(1, content.split("\n").length);

  useLayoutEffect(() => {
    onScrollChangeRef.current = onScrollChange;
  }, [onScrollChange]);

  useLayoutEffect(() => {
    const restore = () => {
      const scrollTop = Math.max(0, latestScrollTopRef.current);
      if (textareaRef.current) textareaRef.current.scrollTop = scrollTop;
      if (linesRef.current) linesRef.current.scrollTop = scrollTop;
    };
    restore();
    const frame = requestAnimationFrame(restore);
    return () => {
      cancelAnimationFrame(frame);
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
      onScrollChangeRef.current?.(latestScrollTopRef.current);
    };
  }, []);

  const rememberScrollPosition = (scrollTop: number) => {
    latestScrollTopRef.current = scrollTop;
    if (linesRef.current) linesRef.current.scrollTop = scrollTop;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      onScrollChangeRef.current?.(latestScrollTopRef.current);
    });
  };

  const updateContent = (value: string) => {
    const sanitized = sanitizeNoteText(value);
    setContent(sanitized);
    onChange(sanitized);
    return sanitized;
  };

  return (
    <section className="note-pane">
      <header className="note-header">
        <span>
          <StickyNote size={13} />
          Workspace note
        </span>
        <small>{lineCount} lines · saved locally</small>
        {onNewTab && (
          <button type="button" title="New note tab" onClick={onNewTab}>
            <Plus size={13} />
          </button>
        )}
      </header>
      <div className="note-editor">
        <div className="note-lines" ref={linesRef} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          autoFocus
          value={content}
          spellCheck
          placeholder={"Write one item per line…\nURLs, commands, deployment notes…"}
          onChange={(event) => {
            updateContent(event.target.value);
          }}
          onPaste={(event) => {
            event.preventDefault();
            const field = event.currentTarget;
            const pasted = sanitizeNoteText(
              event.clipboardData.getData("text/plain"),
            );
            const start = field.selectionStart;
            const next = `${content.slice(0, start)}${pasted}${content.slice(
              field.selectionEnd,
            )}`;
            const cursor = start + pasted.length;
            updateContent(next);
            requestAnimationFrame(() => {
              field.selectionStart = cursor;
              field.selectionEnd = cursor;
            });
          }}
          onScroll={(event) =>
            rememberScrollPosition(event.currentTarget.scrollTop)
          }
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            event.preventDefault();
            const field = event.currentTarget;
            const next = `${content.slice(0, field.selectionStart)}  ${content.slice(
              field.selectionEnd,
            )}`;
            const cursor = field.selectionStart + 2;
            updateContent(next);
            requestAnimationFrame(() => {
              field.selectionStart = cursor;
              field.selectionEnd = cursor;
            });
          }}
        />
      </div>
    </section>
  );
}
