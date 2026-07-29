import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Globe2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { BrowserBounds, BrowserState } from "../types";

interface BrowserPaneProps {
  id: string;
  initialUrl: string;
  visible: boolean;
  onUrlChange: (url: string) => void;
}

export function BrowserPane({
  id,
  initialUrl,
  visible,
  onUrlChange,
}: BrowserPaneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [address, setAddress] = useState(initialUrl);
  const [state, setState] = useState<BrowserState>({
    id,
    url: initialUrl,
    title: "Browser",
    loading: true,
    canGoBack: false,
    canGoForward: false,
  });
  const [overlayDepth, setOverlayDepth] = useState(0);
  const readInitialUrl = useEffectEvent(() => initialUrl);
  const reportUrlChange = useEffectEvent((url: string) => onUrlChange(url));

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let disposed = false;
    const readBounds = (): BrowserBounds => {
      const rect = viewport.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
    };
    const updateBounds = () => {
      if (!disposed) window.fzTerminal.browser.setBounds(id, readBounds());
    };
    const stopState = window.fzTerminal.browser.onState((next) => {
      if (next.id !== id || disposed) return;
      setState(next);
      if (next.url) {
        setAddress(next.url);
        reportUrlChange(next.url);
      }
    });
    const observer = new ResizeObserver(updateBounds);
    observer.observe(viewport);
    void window.fzTerminal.browser.create(id, readInitialUrl(), readBounds());
    const frame = requestAnimationFrame(updateBounds);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      stopState();
      window.fzTerminal.browser.setVisible(id, false);
    };
  }, [id]);

  useEffect(() => {
    const onOverlay = (event: Event) => {
      const delta = Number((event as CustomEvent<number>).detail) || 0;
      setOverlayDepth((current) => Math.max(0, current + delta));
    };
    window.addEventListener("fz:native-overlay", onOverlay);
    return () => window.removeEventListener("fz:native-overlay", onOverlay);
  }, []);

  useEffect(() => {
    window.fzTerminal.browser.setVisible(id, visible && overlayDepth === 0);
  }, [id, overlayDepth, visible]);

  const navigate = () => {
    if (address.trim()) window.fzTerminal.browser.navigate(id, address);
  };

  return (
    <section className="browser-pane">
      <header className="browser-toolbar">
        <div className="browser-nav">
          <button
            type="button"
            title="Back"
            disabled={!state.canGoBack}
            onClick={() => window.fzTerminal.browser.back(id)}
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            title="Forward"
            disabled={!state.canGoForward}
            onClick={() => window.fzTerminal.browser.forward(id)}
          >
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            title="Reload"
            onClick={() => window.fzTerminal.browser.reload(id)}
          >
            {state.loading ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <RefreshCw size={13} />
            )}
          </button>
        </div>
        <form
          className="browser-address"
          onSubmit={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          <Globe2 size={13} />
          <input
            size={Math.min(96, Math.max(18, address.length + 1))}
            value={address}
            spellCheck={false}
            aria-label="Browser address"
            onChange={(event) => setAddress(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
          />
        </form>
        <span className="browser-title" title={state.title}>
          {state.title || "Browser"}
        </span>
      </header>
      {state.error && <div className="browser-error">{state.error}</div>}
      <div className="browser-viewport" ref={viewportRef}>
        <div className="browser-placeholder">
          <Globe2 size={24} />
          <span>Loading secure browser view…</span>
        </div>
      </div>
    </section>
  );
}
