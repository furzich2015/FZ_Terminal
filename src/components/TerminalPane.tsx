import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  SearchAddon,
  type ISearchOptions,
} from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import {
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Edit3,
  Eraser,
  File,
  Folder,
  FolderSearch,
  History,
  MoreHorizontal,
  MousePointer2,
  Play,
  RotateCcw,
  Search,
  Settings,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Trash2,
  X,
} from "lucide-react";
import type {
  AppSettings,
  CommandGroup,
  DirectoryEntry,
  MenuPosition,
  QuickCommand,
  SplitDirection,
  SplitNode,
  ThemeDefinition,
} from "../types";
import { fonts } from "../lib/themes";
import { useAppStore } from "../store/appStore";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import {
  TerminalHistory,
  type CommandBlock,
} from "./TerminalHistory";

interface CompletionPopup {
  items: DirectoryEntry[];
  token: string;
  pathSeparator: "/" | "\\";
  needsSeparator: boolean;
  cwd: string;
  x: number;
  y: number;
}

const COMMAND_BLOCK_OUTPUT_LIMIT = 2_000_000;
const COMMAND_BLOCK_FLUSH_THRESHOLD = 256_000;
const STORED_COMMAND_OUTPUT_LIMIT = 3_000_000;

interface TerminalPaneProps {
  pane: SplitNode & { type: "pane" };
  active: boolean;
  settings: AppSettings;
  theme: ThemeDefinition;
  commandGroups: CommandGroup[];
  onFocus: () => void;
  onSplit: (direction: SplitDirection) => void;
  onClose: () => void;
  onRenameTab: () => void;
  onOpenSettings: () => void;
}

export function TerminalPane({
  pane,
  active,
  settings,
  theme,
  commandGroups,
  onFocus,
  onSplit,
  onClose,
  onRenameTab,
  onOpenSettings,
}: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fitTerminalRef = useRef<() => void>(() => undefined);
  const settingsRef = useRef(settings);
  const themeRef = useRef(theme);
  const screenScrollEnabledRef = useRef(settings.terminal.screenScrollMode);
  const screenCopyModeRef = useRef(false);
  const inputBufferRef = useRef("");
  const activeBlockIdRef = useRef<string | null>(null);
  const pendingOutputRef = useRef("");
  const historyFlushTimerRef = useRef<number | null>(null);
  const fontNoticeTimerRef = useRef<number | null>(null);
  const requestCompletionRef = useRef<() => void>(() => undefined);
  const pasteTextRef = useRef<(text: string) => void>(() => undefined);
  const recordCommandRef = useRef<(command: string) => void>(
    () => undefined,
  );
  const remoteSessionRef = useRef(false);
  const screenDetectedRef = useRef(false);
  const screenPrefixRef = useRef(false);
  const lastPasteRef = useRef({ text: "", at: 0 });
  const [title, setTitle] = useState("Shell");
  const [exited, setExited] = useState(false);
  const [bell, setBell] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [screenScrollOverride, setScreenScrollOverride] = useState<
    boolean | null
  >(null);
  const [screenCopyActive, setScreenCopyActive] = useState(false);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState({
    index: 0,
    count: 0,
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);
  const [commandBlocks, setCommandBlocks] = useState<CommandBlock[]>(() =>
    loadCommandBlocks(pane.sessionId),
  );
  const commandBlocksRef = useRef(commandBlocks);
  const [completion, setCompletion] = useState<CompletionPopup | null>(null);
  const [completionSearch, setCompletionSearch] = useState("");
  const [completionNotice, setCompletionNotice] = useState<string | null>(
    null,
  );
  const completionNoticeTimerRef = useRef<number | null>(null);
  const [screenDetected, setScreenDetected] = useState(false);
  const [fontNotice, setFontNotice] = useState<number | null>(null);
  const screenScrollEnabled =
    screenScrollOverride ??
    (settings.terminal.screenScrollMode || screenDetected);

  useEffect(() => {
    settingsRef.current = settings;
    themeRef.current = theme;
    screenScrollEnabledRef.current = screenScrollEnabled;
  }, [screenScrollEnabled, settings, theme]);

  useEffect(() => {
    const openSearch = (event: Event) => {
      const sessionId = (event as CustomEvent<string>).detail;
      if (sessionId !== pane.sessionId) return;
      setHistoryOpen(false);
      setSearchOpen(true);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    };
    const clearInput = (event: Event) => {
      const sessionId = (event as CustomEvent<string>).detail;
      if (sessionId === pane.sessionId) inputBufferRef.current = "";
    };
    const showCompletions = (event: Event) => {
      const sessionId = (event as CustomEvent<string>).detail;
      if (sessionId === pane.sessionId) requestCompletionRef.current();
    };
    const quickCommand = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          sessionId: string;
          command: string;
          execute: boolean;
        }>
      ).detail;
      if (detail.sessionId !== pane.sessionId) return;
      inputBufferRef.current = detail.command;
      if (detail.execute) {
        recordCommandRef.current(detail.command);
        inputBufferRef.current = "";
      }
      terminalRef.current?.focus();
      requestAnimationFrame(() => terminalRef.current?.focus());
    };
    const copyTerminal = (event: Event) => {
      const sessionId = (event as CustomEvent<string>).detail;
      if (sessionId !== pane.sessionId) return;
      const terminal = terminalRef.current;
      if (terminal?.hasSelection()) {
        window.fzTerminal.clipboard.writeText(terminal.getSelection());
      }
      terminal?.focus();
    };
    const pasteTerminal = (event: Event) => {
      const sessionId = (event as CustomEvent<string>).detail;
      if (sessionId !== pane.sessionId) return;
      void window.fzTerminal.clipboard
        .readText()
        .then((text) => pasteTextRef.current(text));
    };
    window.addEventListener("fz:search-terminal", openSearch);
    window.addEventListener("fz:clear-input", clearInput);
    window.addEventListener("fz:show-completions", showCompletions);
    window.addEventListener("fz:quick-command", quickCommand);
    window.addEventListener("fz:copy-terminal", copyTerminal);
    window.addEventListener("fz:paste-terminal", pasteTerminal);
    return () => {
      window.removeEventListener("fz:search-terminal", openSearch);
      window.removeEventListener("fz:clear-input", clearInput);
      window.removeEventListener("fz:show-completions", showCompletions);
      window.removeEventListener("fz:quick-command", quickCommand);
      window.removeEventListener("fz:copy-terminal", copyTerminal);
      window.removeEventListener("fz:paste-terminal", pasteTerminal);
    };
  }, [pane.sessionId]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    const initialSettings = settingsRef.current;
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon({ highlightLimit: 1000 });
    const terminal = new Terminal({
      allowProposedApi: true,
      allowTransparency: true,
      convertEol: false,
      cursorBlink: initialSettings.terminal.cursorBlink,
      cursorStyle: initialSettings.terminal.cursorStyle,
      fontFamily: fonts[initialSettings.appearance.font].css,
      fontSize: initialSettings.appearance.fontSize,
      lineHeight: initialSettings.appearance.lineHeight,
      scrollback: initialSettings.terminal.scrollback,
      smoothScrollDuration: 80,
      theme: themeRef.current.xterm,
    });

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(
      new WebLinksAddon((event, uri) => {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("fz:open-browser", { detail: uri }),
        );
      }),
    );
    terminal.open(host);
    terminalRef.current = terminal;
    fitRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    const pasteText = (text: string) => {
      if (!text) return;
      const now = performance.now();
      if (
        lastPasteRef.current.text === text &&
        now - lastPasteRef.current.at < 180
      ) {
        return;
      }
      lastPasteRef.current = { text, at: now };
      terminal.paste(text);
      terminal.focus();
    };
    pasteTextRef.current = pasteText;
    const disposeSearchResults = searchAddon.onDidChangeResults((event) => {
      setSearchResult({
        index: event.resultIndex < 0 ? 0 : event.resultIndex + 1,
        count: event.resultCount,
      });
    });

    const saveHistory = (blocks: CommandBlock[]) => {
      commandBlocksRef.current = blocks;
      setCommandBlocks(blocks);
      saveCommandBlocks(pane.sessionId, blocks);
    };
    const flushHistoryOutput = () => {
      if (historyFlushTimerRef.current) {
        window.clearTimeout(historyFlushTimerRef.current);
        historyFlushTimerRef.current = null;
      }
      if (!activeBlockIdRef.current || !pendingOutputRef.current) return;
      const blockId = activeBlockIdRef.current;
      const output = pendingOutputRef.current;
      pendingOutputRef.current = "";
      const next = commandBlocksRef.current.map((block) =>
        block.id === blockId
          ? {
              ...block,
              output: retainCommandOutput(
                `${block.output}${output}`,
                COMMAND_BLOCK_OUTPUT_LIMIT,
              ),
            }
          : block,
      );
      saveHistory(next);
    };
    const appendHistoryOutput = (data: string) => {
      if (!activeBlockIdRef.current) return;
      pendingOutputRef.current += stripTerminalSequences(data);
      if (
        pendingOutputRef.current.length >= COMMAND_BLOCK_FLUSH_THRESHOLD
      ) {
        flushHistoryOutput();
        return;
      }
      if (historyFlushTimerRef.current) {
        window.clearTimeout(historyFlushTimerRef.current);
      }
      historyFlushTimerRef.current = window.setTimeout(
        flushHistoryOutput,
        140,
      );
    };
    const startCommandBlock = (command: string) => {
      flushHistoryOutput();
      const trimmed = command.trim();
      if (!trimmed) return;
      const block: CommandBlock = {
        id: crypto.randomUUID(),
        command: trimmed,
        output: "",
        startedAt: Date.now(),
      };
      activeBlockIdRef.current = block.id;
      saveHistory([...commandBlocksRef.current, block].slice(-40));
    };
    recordCommandRef.current = startCommandBlock;
    const trackInput = (data: string) => {
      if (data.startsWith("\x1b")) return;
      for (const character of data) {
        if (character === "\r" || character === "\n") {
          const command = inputBufferRef.current;
          startCommandBlock(command);
          if (isScreenCommand(command)) {
            screenDetectedRef.current = true;
            setScreenDetected(true);
          } else if (
            screenDetectedRef.current &&
            /^(exit|logout)$/.test(command.trim())
          ) {
            screenDetectedRef.current = false;
            screenCopyModeRef.current = false;
            setScreenDetected(false);
            setScreenCopyActive(false);
          }
          inputBufferRef.current = "";
        } else if (character === "\x7f" || character === "\b") {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        } else if (character === "\x15" || character === "\x03") {
          inputBufferRef.current = "";
        } else if (character.charCodeAt(0) >= 32) {
          inputBufferRef.current += character;
        }
      }
    };
    const requestCompletion = async () => {
      if (!settingsRef.current.terminal.fileCompletion) return;
      const input = inputBufferRef.current;
      const hasArguments = /\s/.test(input);
      const token = input.endsWith(" ")
        ? ""
        : hasArguments
          ? (input.split(/\s+/).at(-1) ?? "")
          : "";
      const separatorIndex = Math.max(
        token.lastIndexOf("/"),
        token.lastIndexOf("\\"),
      );
      const directoryToken =
        separatorIndex >= 0 ? token.slice(0, separatorIndex + 1) : "";
      const tokenLeaf =
        separatorIndex >= 0 ? token.slice(separatorIndex + 1) : token;
      const pathSeparator =
        token.includes("\\") && !token.includes("/") ? "\\" : "/";
      const screen = host.querySelector<HTMLElement>(".xterm-screen");
      const cellWidth = screen ? screen.clientWidth / terminal.cols : 8;
      const cellHeight = screen ? screen.clientHeight / terminal.rows : 17;
      const x = Math.min(
        Math.max(8, terminal.buffer.active.cursorX * cellWidth + 9),
        Math.max(8, host.clientWidth - 330),
      );
      const y = Math.min(
        Math.max(8, (terminal.buffer.active.cursorY + 1) * cellHeight + 9),
        Math.max(8, host.clientHeight - 230),
      );
      setCompletion(null);
      setCompletionSearch("");
      const listing = await window.fzTerminal.pty.listDirectory(
        pane.sessionId,
        directoryToken || undefined,
      );
      if (disposed) return;
      if (listing.remote) {
        remoteSessionRef.current = true;
        setCompletion(null);
        setCompletionNotice(
          "Local file suggestions are disabled in SSH. Tab was sent to the server.",
        );
        if (completionNoticeTimerRef.current) {
          window.clearTimeout(completionNoticeTimerRef.current);
        }
        completionNoticeTimerRef.current = window.setTimeout(
          () => setCompletionNotice(null),
          2200,
        );
        window.fzTerminal.pty.write(pane.sessionId, "\t");
        terminal.focus();
        return;
      }
      remoteSessionRef.current = false;
      const items = listing.entries.filter(
        (entry) =>
          (tokenLeaf.startsWith(".") || !entry.name.startsWith(".")) &&
          (!tokenLeaf || entry.name.startsWith(tokenLeaf)),
      );
      setCompletion(
        items.length > 0
          ? {
              items,
              token,
              pathSeparator,
              needsSeparator: !hasArguments && input.trim().length > 0,
              cwd: listing.cwd,
              x,
              y,
            }
          : null,
      );
      terminal.focus();
    };
    requestCompletionRef.current = () => void requestCompletion();

    const disposeInput = terminal.onData((data) => {
      for (const character of data) {
        if (screenPrefixRef.current) {
          screenPrefixRef.current = false;
          if (
            screenDetectedRef.current &&
            (character === "d" || character === "D" || character === "\\")
          ) {
            screenDetectedRef.current = false;
            screenCopyModeRef.current = false;
            setScreenDetected(false);
            setScreenCopyActive(false);
          }
        } else if (character === "\x01") {
          screenPrefixRef.current = true;
        }
      }
      if (
        screenCopyModeRef.current &&
        (data === "\x1b" || data === "\r" || data === "q")
      ) {
        screenCopyModeRef.current = false;
        setScreenCopyActive(false);
      }
      if (data === "\t" && settingsRef.current.terminal.fileCompletion) {
        if (remoteSessionRef.current) {
          setCompletion(null);
          trackInput(data);
          window.fzTerminal.pty.write(pane.sessionId, data);
          return;
        }
        void requestCompletion();
        return;
      }
      setCompletion(null);
      if (
        (data.includes("\r") || data.includes("\n")) &&
        !inputBufferRef.current.trim()
      ) {
        inputBufferRef.current = readCommandAtCursor(terminal);
      }
      trackInput(data);
      window.fzTerminal.pty.write(pane.sessionId, data);
    });
    const disposeTitle = terminal.onTitleChange((value) => {
      setTitle(value || "Shell");
    });
    const disposeBell = terminal.onBell(() => {
      setBell(true);
      window.setTimeout(() => setBell(false), 180);
    });
    const disposeSelection = terminal.onSelectionChange(() => {
      const selected = terminal.hasSelection();
      setHasSelection(selected);
      if (settingsRef.current.terminal.copyOnSelect && selected) {
        window.fzTerminal.clipboard.writeText(terminal.getSelection());
      }
    });

    terminal.attachCustomKeyEventHandler((event) => {
      const primary = event.ctrlKey || event.metaKey;
      if (event.type !== "keydown" || !primary) return true;
      if (
        event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "a" &&
        !screenDetectedRef.current
      ) {
        selectCurrentInput(terminal, inputBufferRef.current);
        return false;
      }
      if (
        !event.shiftKey &&
        event.code === "Space" &&
        settingsRef.current.terminal.fileCompletion
      ) {
        void requestCompletion();
        return false;
      }
      return true;
    });

    const handleNativePaste = (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      pasteText(event.clipboardData?.getData("text/plain") ?? "");
    };
    host.addEventListener("paste", handleNativePaste, true);

    const syncSessionContext = async () => {
      try {
        const context = await window.fzTerminal.pty.getContext(
          pane.sessionId,
        );
        if (disposed) return;
        remoteSessionRef.current = context.remote;
        if (context.multiplexer === "screen") {
          screenDetectedRef.current = true;
          setScreenDetected(true);
        } else if (!context.remote && screenDetectedRef.current) {
          screenDetectedRef.current = false;
          setScreenDetected(false);
          screenCopyModeRef.current = false;
          setScreenCopyActive(false);
        }
      } catch {
        // Context detection is best-effort on non-Linux platforms.
      }
    };
    void syncSessionContext();
    const contextInterval = window.setInterval(syncSessionContext, 1400);

    const stopData = window.fzTerminal.pty.onData((event) => {
      if (event.id !== pane.sessionId) return;
      terminal.write(event.data);
      appendHistoryOutput(event.data);
    });
    const stopExit = window.fzTerminal.pty.onExit((event) => {
      if (event.id !== pane.sessionId) return;
      setExited(true);
      terminal.write(
        `\r\n\x1b[38;2;255;107;112mProcess exited with code ${event.exitCode}\x1b[0m\r\n`,
      );
    });

    let fittedCols = terminal.cols;
    let fittedRows = terminal.rows;
    const fit = () => {
      if (disposed) return;
      try {
        const dimensions = fitAddon.proposeDimensions();
        if (dimensions) {
          terminal.resize(dimensions.cols, dimensions.rows);
        } else {
          fitAddon.fit();
        }
        const geometryChanged =
          terminal.cols !== fittedCols || terminal.rows !== fittedRows;
        fittedCols = terminal.cols;
        fittedRows = terminal.rows;
        if (geometryChanged && screenCopyModeRef.current) {
          window.fzTerminal.pty.write(pane.sessionId, "\x1b");
          screenCopyModeRef.current = false;
          setScreenCopyActive(false);
        }
        window.fzTerminal.pty.resize(
          pane.sessionId,
          terminal.cols,
          terminal.rows,
        );
      } catch {
        // The pane can be hidden while changing tabs.
      }
    };
    fitTerminalRef.current = fit;
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey && event.deltaY !== 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const current = settingsRef.current.appearance.fontSize;
        const next = Math.min(
          30,
          Math.max(9, current + (event.deltaY < 0 ? 1 : -1)),
        );
        if (next !== current) {
          useAppStore.getState().updateAppearance({ fontSize: next });
          setFontNotice(next);
          if (fontNoticeTimerRef.current) {
            window.clearTimeout(fontNoticeTimerRef.current);
          }
          fontNoticeTimerRef.current = window.setTimeout(
            () => setFontNotice(null),
            900,
          );
        }
        return;
      }
      if (!screenScrollEnabledRef.current || event.deltaY === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!screenCopyModeRef.current) {
        window.fzTerminal.pty.write(pane.sessionId, "\x01[");
        screenCopyModeRef.current = true;
        setScreenCopyActive(true);
      }
      const pages = Math.min(
        3,
        Math.max(1, Math.ceil(Math.abs(event.deltaY) / 120)),
      );
      const key = event.deltaY < 0 ? "\x1b[5~" : "\x1b[6~";
      window.setTimeout(
        () => window.fzTerminal.pty.write(pane.sessionId, key.repeat(pages)),
        18,
      );
    };
    host.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });
    window.addEventListener("resize", fit);
    const frame = requestAnimationFrame(async () => {
      fit();
      const result = await window.fzTerminal.pty.create({
        id: pane.sessionId,
        cols: terminal.cols,
        rows: terminal.rows,
        shell: initialSettings.terminal.shell || undefined,
      });
      if (disposed) return;
      if (result.backlog) terminal.write(result.backlog);
      fit();
      requestAnimationFrame(fit);
      terminal.focus();
    });
    const fitTimers = [60, 180, 420].map((delay) =>
      window.setTimeout(fit, delay),
    );
    const fitInterval = window.setInterval(fit, 250);
    const stopFitInterval = window.setTimeout(
      () => window.clearInterval(fitInterval),
      2200,
    );
    void document.fonts.ready.then(fit);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      fitTimers.forEach(window.clearTimeout);
      window.clearInterval(fitInterval);
      window.clearTimeout(stopFitInterval);
      if (historyFlushTimerRef.current) {
        window.clearTimeout(historyFlushTimerRef.current);
      }
      if (fontNoticeTimerRef.current) {
        window.clearTimeout(fontNoticeTimerRef.current);
      }
      if (completionNoticeTimerRef.current) {
        window.clearTimeout(completionNoticeTimerRef.current);
      }
      window.clearInterval(contextInterval);
      flushHistoryOutput();
      observer.disconnect();
      host.removeEventListener("wheel", handleWheel, true);
      host.removeEventListener("paste", handleNativePaste, true);
      window.removeEventListener("resize", fit);
      disposeInput.dispose();
      disposeTitle.dispose();
      disposeBell.dispose();
      disposeSelection.dispose();
      disposeSearchResults.dispose();
      stopData();
      stopExit();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      searchAddonRef.current = null;
      fitTerminalRef.current = () => undefined;
      requestCompletionRef.current = () => undefined;
      pasteTextRef.current = () => undefined;
      recordCommandRef.current = () => undefined;
    };
  }, [pane.sessionId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = theme.xterm;
    terminal.options.fontFamily = fonts[settings.appearance.font].css;
    terminal.options.fontSize = settings.appearance.fontSize;
    terminal.options.lineHeight = settings.appearance.lineHeight;
    terminal.options.cursorBlink = settings.terminal.cursorBlink;
    terminal.options.cursorStyle = settings.terminal.cursorStyle;
    terminal.options.scrollback = settings.terminal.scrollback;
    requestAnimationFrame(() => fitTerminalRef.current());
  }, [settings, theme]);

  useEffect(() => {
    if (active) {
      terminalRef.current?.focus();
      requestAnimationFrame(() => fitTerminalRef.current());
    }
  }, [active]);

  const runCommand = (command: QuickCommand) => {
    const fastExecution = command.fastExecution ?? true;
    inputBufferRef.current = command.command;
    if (fastExecution) {
      recordCommandRef.current(command.command);
      inputBufferRef.current = "";
    }
    window.fzTerminal.pty.write(
      pane.sessionId,
      `${command.command}${fastExecution ? "\r" : ""}`,
    );
    terminalRef.current?.focus();
  };

  const showFileCompletions = () => {
    if (!settings.terminal.fileCompletion) return;
    requestCompletionRef.current();
  };

  const openTerminalSearch = () => {
    setHistoryOpen(false);
    setSearchOpen(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const closeTerminalSearch = () => {
    searchAddonRef.current?.clearDecorations();
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResult({ index: 0, count: 0 });
    terminalRef.current?.focus();
  };

  const runTerminalSearch = (
    value: string,
    direction: "next" | "previous" = "next",
    incremental = false,
  ) => {
    setSearchQuery(value);
    const searchAddon = searchAddonRef.current;
    if (!searchAddon) return;
    if (!value) {
      searchAddon.clearDecorations();
      setSearchResult({ index: 0, count: 0 });
      return;
    }

    const options = buildExactSearchOptions(
      theme,
      settings.terminal.searchHighlightAll,
      settings.terminal.searchHighlightColor,
      incremental,
    );
    if (direction === "previous") {
      searchAddon.findPrevious(value, options);
    } else {
      searchAddon.findNext(value, options);
    }
  };

  const insertCompletion = (item: DirectoryEntry) => {
    if (!completion) return;
    const tokenLeaf = completion.token.split("/").at(-1) ?? completion.token;
    const completedName = `${item.name}${
      item.directory ? completion.pathSeparator : ""
    }`;
    const suffix = item.name.startsWith(tokenLeaf)
      ? completedName.slice(tokenLeaf.length)
      : completedName;
    const insertion = `${completion.needsSeparator ? " " : ""}${suffix}`;
    if (insertion) {
      window.fzTerminal.pty.write(pane.sessionId, insertion);
      inputBufferRef.current += insertion;
    }
    setCompletion(null);
    setCompletionSearch("");
    terminalRef.current?.focus();
  };

  const clearCommandBlocks = () => {
    commandBlocksRef.current = [];
    activeBlockIdRef.current = null;
    pendingOutputRef.current = "";
    setCommandBlocks([]);
    saveCommandBlocks(pane.sessionId, []);
  };

  const deleteCommandBlock = (blockId: string) => {
    if (activeBlockIdRef.current === blockId) {
      activeBlockIdRef.current = null;
      pendingOutputRef.current = "";
    }
    const next = commandBlocksRef.current.filter(
      (block) => block.id !== blockId,
    );
    commandBlocksRef.current = next;
    setCommandBlocks(next);
    saveCommandBlocks(pane.sessionId, next);
  };

  const toggleScreenScroll = () => {
    if (screenScrollEnabled && screenCopyModeRef.current) {
      window.fzTerminal.pty.write(pane.sessionId, "\x1b");
      screenCopyModeRef.current = false;
      setScreenCopyActive(false);
    }
    setScreenScrollOverride(!screenScrollEnabled);
    terminalRef.current?.focus();
  };

  const quickCommands: ContextMenuItem[] = commandGroups.flatMap((group) =>
    group.commands.map((command) => ({
      label: `${group.name} / ${command.name}`,
      icon: Play,
      action: () => runCommand(command),
    })),
  );
  const completionItems =
    completion?.items.filter((item) =>
      item.name
        .toLowerCase()
        .includes(completionSearch.trim().toLowerCase()),
    ) ?? [];

  const items: ContextMenuItem[] = [
    {
      label: "Copy",
      icon: Copy,
      shortcut: "Ctrl C",
      disabled: !hasSelection,
      action: () => {
        const selection = terminalRef.current?.getSelection();
        if (selection) window.fzTerminal.clipboard.writeText(selection);
      },
    },
    {
      label: "Paste",
      icon: Clipboard,
      shortcut: "Ctrl V",
      action: () => {
        void window.fzTerminal.clipboard
          .readText()
          .then((text) => pasteTextRef.current(text));
      },
    },
    {
      label: "Send interrupt",
      icon: X,
      shortcut: "Ctrl Alt C",
      action: () => {
        inputBufferRef.current = "";
        window.fzTerminal.pty.write(pane.sessionId, "\x03");
        terminalRef.current?.focus();
      },
    },
    {
      label: "Show file completions",
      icon: FolderSearch,
      shortcut: "Tab",
      disabled: !settings.terminal.fileCompletion,
      action: showFileCompletions,
    },
    {
      label: "Search terminal",
      icon: Search,
      shortcut: "Ctrl F",
      action: openTerminalSearch,
    },
    {
      label: "Open command history",
      icon: History,
      action: () => setHistoryOpen(true),
    },
    { separator: true },
    {
      label: "Clear buffer",
      icon: Eraser,
      shortcut: "Ctrl L",
      action: () => {
        terminalRef.current?.clear();
        window.fzTerminal.pty.write(pane.sessionId, "\x0c");
      },
    },
    {
      label: "Reset terminal",
      icon: RotateCcw,
      action: () => terminalRef.current?.reset(),
    },
    {
      label: "Run quick command",
      icon: Play,
      disabled: quickCommands.length === 0,
      children: quickCommands,
    },
    {
      label: screenScrollEnabled
        ? "Disable GNU Screen wheel"
        : "Enable GNU Screen wheel",
      icon: MousePointer2,
      action: toggleScreenScroll,
    },
    { separator: true },
    {
      label: "Split left / right",
      icon: SplitSquareHorizontal,
      action: () => onSplit("horizontal"),
    },
    {
      label: "Split top / bottom",
      icon: SplitSquareVertical,
      action: () => onSplit("vertical"),
    },
    {
      label: "Rename tab",
      icon: Edit3,
      action: onRenameTab,
    },
    {
      label: "Pane settings…",
      icon: Settings,
      action: onOpenSettings,
    },
    { separator: true },
    {
      label: "Close pane",
      icon: Trash2,
      danger: true,
      action: onClose,
    },
  ];

  return (
    <section
      className={`terminal-pane ${active ? "active" : ""} ${
        bell ? "bell" : ""
      } ${commandBlocks.length > 0 ? "has-command-blocks" : ""}`}
      data-session-id={pane.sessionId}
      onMouseDown={onFocus}
      onContextMenu={(event) => {
        event.preventDefault();
        onFocus();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <header className="pane-header">
        <div className="pane-title">
          <span
            className={`pane-status ${exited ? "exited" : "running"}`}
          />
          <span>{exited ? "Exited" : title}</span>
          {screenScrollEnabled && (
            <span className={`pane-mode ${screenCopyActive ? "live" : ""}`}>
              {screenCopyActive ? "SCREEN COPY" : "SCREEN WHEEL"}
            </span>
          )}
        </div>
        <div className="pane-actions">
          <button
            type="button"
            title="Search terminal (Ctrl+F)"
            onClick={openTerminalSearch}
          >
            <Search size={12} />
          </button>
          <button
            type="button"
            title={`${commandBlocks.length} saved command blocks`}
            onClick={() => {
              setHistoryTargetId(null);
              setHistoryOpen(true);
            }}
          >
            <History size={12} />
          </button>
          <button
            type="button"
            title="Show files and directories (Tab)"
            disabled={!settings.terminal.fileCompletion}
            onClick={showFileCompletions}
          >
            <FolderSearch size={12} />
          </button>
          <button
            type="button"
            title="Split left / right"
            onClick={() => onSplit("horizontal")}
          >
            <SplitSquareHorizontal size={12} />
          </button>
          <button
            type="button"
            title="Split top / bottom"
            onClick={() => onSplit("vertical")}
          >
            <SplitSquareVertical size={12} />
          </button>
          <button
            type="button"
            title="Pane menu"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setMenu({ x: rect.right - 220, y: rect.bottom + 4 });
            }}
          >
            <MoreHorizontal size={13} />
          </button>
          <button type="button" title="Close pane" onClick={onClose}>
            <X size={12} />
          </button>
        </div>
      </header>
      {commandBlocks.length > 0 && (
        <nav
          className="command-block-rail"
          aria-label="Collapsed command output blocks"
        >
          {[...commandBlocks]
            .slice(-8)
            .reverse()
            .map((block) => (
              <button
                type="button"
                className="command-block-chip"
                key={block.id}
                title={`Open output for: ${block.command}`}
                onClick={() => {
                  setHistoryTargetId(block.id);
                  setHistoryOpen(true);
                }}
              >
                <History size={10} />
                <code>{block.command}</code>
                <small>{formatOutputSize(block.output.length)}</small>
              </button>
            ))}
          {commandBlocks.length > 8 && (
            <button
              type="button"
              className="command-block-chip more"
              title="Open all saved command blocks"
              onClick={() => {
                setHistoryTargetId(null);
                setHistoryOpen(true);
              }}
            >
              +{commandBlocks.length - 8}
            </button>
          )}
        </nav>
      )}
      <div
        className="terminal-host"
        ref={hostRef}
        style={
          {
            "--terminal-background": theme.xterm.background,
            opacity: settings.appearance.opacity,
          } as CSSProperties
        }
      />
      {searchOpen && (
        <div
          className="terminal-search"
          role="search"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <Search size={13} />
          <input
            ref={searchInputRef}
            autoFocus
            value={searchQuery}
            spellCheck={false}
            placeholder="Exact text…"
            aria-label="Search exact text in terminal"
            onChange={(event) =>
              runTerminalSearch(event.target.value, "next", true)
            }
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeTerminalSearch();
              } else if (event.key === "Enter") {
                event.preventDefault();
                runTerminalSearch(
                  searchQuery,
                  event.shiftKey ? "previous" : "next",
                );
              }
            }}
          />
          <span className="terminal-search-mode" title="Exact, case-sensitive">
            <i
              style={{
                background: settings.terminal.searchHighlightColor,
              }}
            />
            Exact Aa
          </span>
          <span className="terminal-search-count">
            {searchQuery ? `${searchResult.index}/${searchResult.count}` : "0/0"}
          </span>
          <button
            type="button"
            title="Previous match (Shift+Enter)"
            disabled={!searchQuery || searchResult.count === 0}
            onClick={() => runTerminalSearch(searchQuery, "previous")}
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            title="Next match (Enter)"
            disabled={!searchQuery || searchResult.count === 0}
            onClick={() => runTerminalSearch(searchQuery)}
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            title="Close search (Escape)"
            onClick={closeTerminalSearch}
          >
            <X size={13} />
          </button>
        </div>
      )}
      {completion && (
        <div
          className="completion-popup"
          style={{ left: completion.x, top: completion.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <header>
            <FolderSearch size={12} />
            <span title={completion.cwd}>
              {completion.cwd.split("/").filter(Boolean).at(-1) || "/"}
            </span>
            <kbd>TAB</kbd>
          </header>
          <label className="completion-search">
            <Search size={12} />
            <input
              autoFocus
              value={completionSearch}
              spellCheck={false}
              placeholder="Search files and folders…"
              onChange={(event) => setCompletionSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCompletion(null);
                  setCompletionSearch("");
                  terminalRef.current?.focus();
                } else if (event.key === "Enter" && completionItems[0]) {
                  event.preventDefault();
                  insertCompletion(completionItems[0]);
                }
              }}
            />
            <span>{completionItems.length}</span>
          </label>
          <div className="completion-list">
            {completionItems.map((item) => {
              const directory = item.directory;
              return (
                <button
                  type="button"
                  key={item.name}
                  onClick={() => insertCompletion(item)}
                >
                  {directory ? <Folder size={13} /> : <File size={13} />}
                  <span>
                    {item.name}
                    {directory ? "/" : ""}
                  </span>
                  <small>{directory ? "Directory" : "File"}</small>
                </button>
              );
            })}
            {completionItems.length === 0 && (
              <div className="completion-empty">No matching files</div>
            )}
          </div>
        </div>
      )}
      {completionNotice && (
        <div className="completion-notice">{completionNotice}</div>
      )}
      {fontNotice !== null && (
        <div className="font-notice">Terminal font {fontNotice}px</div>
      )}
      <TerminalHistory
        key={`${historyOpen}:${historyTargetId ?? "recent"}`}
        open={historyOpen}
        blocks={commandBlocks}
        initialSelectedId={historyTargetId}
        onClear={clearCommandBlocks}
        onDelete={deleteCommandBlock}
        onClose={() => {
          setHistoryOpen(false);
          setHistoryTargetId(null);
          terminalRef.current?.focus();
        }}
      />
      <div className="pane-focus-ring" />

      <ContextMenu
        open={Boolean(menu)}
        position={menu ?? { x: 0, y: 0 }}
        items={items}
        onClose={() => setMenu(null)}
      />
    </section>
  );
}

function historyStorageKey(sessionId: string) {
  return `fz-terminal-command-blocks:${sessionId}`;
}

function loadCommandBlocks(sessionId: string): CommandBlock[] {
  try {
    const value = localStorage.getItem(historyStorageKey(sessionId));
    if (!value) return [];
    const parsed = JSON.parse(value) as CommandBlock[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (block) =>
          typeof block?.id === "string" &&
          typeof block.command === "string" &&
          typeof block.output === "string" &&
          typeof block.startedAt === "number",
      )
      .slice(-40);
  } catch {
    return [];
  }
}

function saveCommandBlocks(sessionId: string, blocks: CommandBlock[]) {
  try {
    if (blocks.length === 0) {
      localStorage.removeItem(historyStorageKey(sessionId));
    } else {
      let remainingOutput = STORED_COMMAND_OUTPUT_LIMIT;
      const stored = [...blocks];
      for (let index = stored.length - 1; index >= 0; index -= 1) {
        const block = stored[index];
        const output = retainCommandOutput(block.output, remainingOutput);
        remainingOutput = Math.max(0, remainingOutput - output.length);
        stored[index] = { ...block, output };
      }
      localStorage.setItem(historyStorageKey(sessionId), JSON.stringify(stored));
    }
  } catch {
    // History remains available for this run if storage quota is exhausted.
  }
}

function retainCommandOutput(value: string, limit: number) {
  if (limit <= 0) return "";
  if (value.length <= limit) return value;
  const marker = "\n\n[... middle output omitted ...]\n\n";
  if (limit <= marker.length + 2) return value.slice(-limit);
  const headLength = Math.floor((limit - marker.length) * 0.3);
  const tailLength = limit - marker.length - headLength;
  return `${value.slice(0, headLength)}${marker}${value.slice(-tailLength)}`;
}

function formatOutputSize(characters: number) {
  if (characters === 0) return "pending";
  if (characters < 1000) return `${characters} ch`;
  if (characters < 1_000_000) return `${Math.round(characters / 1000)}K`;
  return `${(characters / 1_000_000).toFixed(1)}M`;
}

function stripTerminalSequences(value: string) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\x1b") {
      const kind = value[index + 1];
      if (kind === "[") {
        index += 2;
        while (
          index < value.length &&
          (value.charCodeAt(index) < 64 || value.charCodeAt(index) > 126)
        ) {
          index += 1;
        }
      } else if (kind === "]") {
        index += 2;
        while (index < value.length) {
          if (value[index] === "\x07") break;
          if (value[index] === "\x1b" && value[index + 1] === "\\") {
            index += 1;
            break;
          }
          index += 1;
        }
      } else {
        index += 1;
      }
      continue;
    }
    if (character === "\n") {
      output += "\n";
    } else if (character === "\r") {
      if (value[index + 1] !== "\n") output += "\n";
    } else if (character === "\t") {
      output += " ";
    } else if (character.charCodeAt(0) >= 32) {
      output += character;
    }
  }
  return output;
}

function readCommandAtCursor(terminal: Terminal) {
  const buffer = terminal.buffer.active;
  const line = buffer
    .getLine(buffer.baseY + buffer.cursorY)
    ?.translateToString(true)
    .trim();
  if (!line) return "";
  const promptEnd = Math.max(
    line.lastIndexOf("$ "),
    line.lastIndexOf("# "),
    line.lastIndexOf("> "),
    line.lastIndexOf("% "),
  );
  return promptEnd >= 0 ? line.slice(promptEnd + 2).trim() : "";
}

function selectCurrentInput(terminal: Terminal, trackedInput: string) {
  const command = trackedInput || readCommandAtCursor(terminal);
  if (!command) {
    terminal.clearSelection();
    return;
  }
  const buffer = terminal.buffer.active;
  const cursorOffset =
    (buffer.baseY + buffer.cursorY) * terminal.cols + buffer.cursorX;
  const startOffset = Math.max(0, cursorOffset - command.length);
  terminal.select(
    startOffset % terminal.cols,
    Math.floor(startOffset / terminal.cols),
    command.length,
  );
}

function buildExactSearchOptions(
  theme: ThemeDefinition,
  highlightAll: boolean,
  requestedColor: string,
  incremental: boolean,
): ISearchOptions {
  const highlightColor = /^#[\da-f]{6}$/i.test(requestedColor)
    ? requestedColor
    : theme.ui.warning;
  return {
    regex: false,
    wholeWord: false,
    caseSensitive: true,
    incremental,
    ...(highlightAll
      ? {
          decorations: {
            matchBackground: mixHexColors(
              theme.xterm.background ?? theme.ui.app,
              highlightColor,
              0.3,
            ),
            matchBorder: highlightColor,
            matchOverviewRuler: highlightColor,
            activeMatchBackground: highlightColor,
            activeMatchBorder: theme.ui.text,
            activeMatchColorOverviewRuler: theme.ui.text,
          },
        }
      : {}),
  };
}

function isScreenCommand(command: string) {
  return /(^|(?:sudo\s+))screen(?:\s|$)/.test(command.trim());
}

function mixHexColors(background: string, foreground: string, ratio: number) {
  const parse = (value: string) => {
    const hex = value.replace("#", "").slice(0, 6);
    return [0, 2, 4].map((offset) =>
      Number.parseInt(hex.slice(offset, offset + 2), 16),
    );
  };
  const base = parse(background);
  const accent = parse(foreground);
  const channels = base.map((value, index) =>
    Math.round(value + (accent[index] - value) * ratio),
  );
  return `#${channels
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}
