import { useState } from "react";
import { StickyNote } from "lucide-react";

interface NotePaneProps {
  initialContent: string;
  onChange: (value: string) => void;
}

export function NotePane({ initialContent, onChange }: NotePaneProps) {
  const [content, setContent] = useState(initialContent);
  const lineCount = Math.max(1, content.split("\n").length);

  return (
    <section className="note-pane">
      <header className="note-header">
        <span>
          <StickyNote size={13} />
          Workspace note
        </span>
        <small>{lineCount} lines · saved locally</small>
      </header>
      <div className="note-editor">
        <div className="note-lines" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <textarea
          autoFocus
          value={content}
          spellCheck
          placeholder={"Write one item per line…\nURLs, commands, deployment notes…"}
          onChange={(event) => {
            const value = event.target.value;
            setContent(value);
            onChange(value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            event.preventDefault();
            const field = event.currentTarget;
            const next = `${content.slice(0, field.selectionStart)}  ${content.slice(
              field.selectionEnd,
            )}`;
            const cursor = field.selectionStart + 2;
            setContent(next);
            onChange(next);
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
