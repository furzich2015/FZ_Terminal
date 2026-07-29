import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock3,
  Search,
  Terminal,
  Trash2,
  X,
} from "lucide-react";

export interface CommandBlock {
  id: string;
  command: string;
  output: string;
  startedAt: number;
}

interface TerminalHistoryProps {
  open: boolean;
  blocks: CommandBlock[];
  initialSelectedId?: string | null;
  onClear: () => void;
  onDelete: (blockId: string) => void;
  onClose: () => void;
}

export function TerminalHistory({
  open,
  blocks,
  initialSelectedId = null,
  onClear,
  onDelete,
  onClose,
}: TerminalHistoryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const visible = useMemo(() => [...blocks].reverse(), [blocks]);
  const selected =
    visible.find((block) => block.id === selectedId) ?? visible[0];
  const selectedText = selected
    ? `${selected.command}\n${selected.output.trim()}`
    : "";
  const matchCount = query ? countExactMatches(selectedText, query) : 0;
  const visibleMatch =
    matchCount === 0 ? 0 : Math.min(activeMatch, matchCount - 1);

  useEffect(() => {
    if (!query || matchCount === 0) return;
    rootRef.current
      ?.querySelector<HTMLElement>(
        `[data-history-match="${visibleMatch}"]`,
      )
      ?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
  }, [matchCount, query, visibleMatch]);

  if (!open) return null;

  const moveMatch = (delta: number) => {
    if (matchCount === 0) return;
    setActiveMatch(
      (current) => (current + delta + matchCount) % matchCount,
    );
  };

  let matchIndex = 0;
  const highlight = (text: string): ReactNode =>
    renderExactMatches(text, query, () => {
      const index = matchIndex++;
      return {
        active: index === visibleMatch,
        index,
      };
    });

  return (
    <aside
      className="terminal-history"
      ref={rootRef}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (query) setQuery("");
          else onClose();
        }
      }}
    >
      <header className="history-header">
        <div>
          <span className="eyebrow">Session memory</span>
          <strong>Command blocks</strong>
        </div>
        <div className="history-actions">
          <button
            type="button"
            title="Clear all saved blocks"
            disabled={blocks.length === 0}
            onClick={onClear}
          >
            <Trash2 size={13} />
          </button>
          <button type="button" title="Close history" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </header>

      {visible.length > 0 ? (
        <div className="history-layout">
          <nav className="history-index" aria-label="Command blocks">
            {visible.map((block) => (
              <button
                className={`history-index-item ${
                  block.id === selected?.id ? "active" : ""
                }`}
                type="button"
                key={block.id}
                onClick={() => {
                  setSelectedId(block.id);
                  setActiveMatch(0);
                }}
              >
                <Terminal size={12} />
                <span>
                  <code>{block.command}</code>
                  <time>
                    {new Date(block.startedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </span>
                <span
                  className="history-delete"
                  role="button"
                  tabIndex={0}
                  title="Delete this block"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(block.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onDelete(block.id);
                    }
                  }}
                >
                  <Trash2 size={11} />
                </span>
              </button>
            ))}
          </nav>

          <section className="history-detail">
            <div className="history-search">
              <Search size={13} />
              <input
                autoFocus
                size={Math.min(48, Math.max(18, query.length + 2))}
                value={query}
                spellCheck={false}
                placeholder="Exact search in selected block…"
                aria-label="Exact search in selected command block"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveMatch(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    moveMatch(event.shiftKey ? -1 : 1);
                  }
                }}
              />
              <span title="Exact, case-sensitive">Exact Aa</span>
              <output>
                {query
                  ? `${matchCount === 0 ? 0 : visibleMatch + 1}/${matchCount}`
                  : "0/0"}
              </output>
              <button
                type="button"
                title="Previous exact match"
                disabled={matchCount === 0}
                onClick={() => moveMatch(-1)}
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                title="Next exact match"
                disabled={matchCount === 0}
                onClick={() => moveMatch(1)}
              >
                <ChevronDown size={12} />
              </button>
            </div>

            {selected && (
              <article className="history-block selected">
                <header>
                  <Terminal size={12} />
                  <code>{highlight(selected.command)}</code>
                  <time>
                    <Clock3 size={10} />
                    {new Date(selected.startedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </header>
                <pre>
                  {selected.output.trim()
                    ? highlight(selected.output.trim())
                    : "No output was captured for this command."}
                </pre>
              </article>
            )}
          </section>
        </div>
      ) : (
        <div className="history-empty">
          <Terminal size={20} />
          <strong>No command blocks yet</strong>
          <span>Commands submitted with Enter will appear here.</span>
        </div>
      )}
    </aside>
  );
}

function countExactMatches(text: string, query: string) {
  if (!query) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(query, offset)) !== -1) {
    count += 1;
    offset += query.length;
  }
  return count;
}

function renderExactMatches(
  text: string,
  query: string,
  getMatch: () => {
    active: boolean;
    index: number;
  },
) {
  if (!query) return text;
  const parts: ReactNode[] = [];
  let offset = 0;
  let found = text.indexOf(query, offset);
  while (found !== -1) {
    if (found > offset) parts.push(text.slice(offset, found));
    const match = getMatch();
    parts.push(
      <mark
        className={match.active ? "active" : ""}
        data-history-match={match.index}
        key={`${found}-${parts.length}`}
      >
        {query}
      </mark>,
    );
    offset = found + query.length;
    found = text.indexOf(query, offset);
  }
  if (offset < text.length) parts.push(text.slice(offset));
  return <Fragment>{parts}</Fragment>;
}
