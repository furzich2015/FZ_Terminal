import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Globe2,
  LoaderCircle,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import type {
  BrowserBounds,
  BrowserPageTab,
  BrowserState,
  MenuPosition,
} from "../types";
import { ContextMenu } from "./ContextMenu";

interface BrowserPaneProps {
  id: string;
  tabs: BrowserPageTab[];
  activeTabId?: string;
  visible: boolean;
  onChange: (value: {
    browserTabs: BrowserPageTab[];
    activeBrowserTabId: string;
    browserUrl: string;
  }) => void;
  onPaneContextMenu: (position: MenuPosition) => void;
}

export function BrowserPane({
  id,
  tabs,
  activeTabId,
  visible,
  onChange,
  onPaneContextMenu,
}: BrowserPaneProps) {
  const [states, setStates] = useState<Record<string, BrowserState>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [overlayDepth, setOverlayDepth] = useState(0);
  const [tabMenu, setTabMenu] = useState<{
    tabId: string;
    position: MenuPosition;
  } | null>(null);
  const activeTab =
    tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const activeState = activeTab ? states[activeTab.id] : undefined;
  const address = activeTab
    ? drafts[activeTab.id] ?? activeState?.url ?? activeTab.url
    : "";

  useEffect(() => {
    const onOverlay = (event: Event) => {
      const delta = Number((event as CustomEvent<number>).detail) || 0;
      setOverlayDepth((current) => Math.max(0, current + delta));
    };
    window.addEventListener("fz:native-overlay", onOverlay);
    return () => window.removeEventListener("fz:native-overlay", onOverlay);
  }, []);

  const commit = (
    nextTabs: BrowserPageTab[],
    nextActiveId: string,
  ) => {
    const nextActive =
      nextTabs.find((tab) => tab.id === nextActiveId) ?? nextTabs[0];
    if (!nextActive) return;
    onChange({
      browserTabs: nextTabs,
      activeBrowserTabId: nextActive.id,
      browserUrl: nextActive.url,
    });
  };

  const addBrowserTab = () => {
    const next: BrowserPageTab = {
      id: `browser-${crypto.randomUUID()}`,
      url: "https://www.google.com/",
      title: "New tab",
    };
    commit([...tabs, next], next.id);
  };

  const closeBrowserTab = (tabId: string) => {
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    const nextActive =
      tabId === activeTab?.id
        ? nextTabs[Math.min(Math.max(index, 0), nextTabs.length - 1)]
        : activeTab;
    window.fzTerminal.browser.destroy(tabId);
    setStates((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    setDrafts((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    commit(nextTabs, nextActive?.id ?? nextTabs[0].id);
  };

  const handlePageState = (state: BrowserState) => {
    setStates((current) => ({ ...current, [state.id]: state }));
    const currentTab = tabs.find((tab) => tab.id === state.id);
    if (!currentTab || (!state.url && !state.title)) return;
    const nextUrl = state.url || currentTab.url;
    const nextTitle = state.title || currentTab.title;
    if (nextUrl === currentTab.url && nextTitle === currentTab.title) return;
    const nextTabs = tabs.map((tab) =>
      tab.id === state.id
        ? {
            ...tab,
            url: nextUrl,
            title: nextTitle,
          }
        : tab,
    );
    const selectedId = activeTab?.id ?? nextTabs[0].id;
    const selectedUrl =
      nextTabs.find((tab) => tab.id === selectedId)?.url ?? nextTabs[0].url;
    onChange({
      browserTabs: nextTabs,
      activeBrowserTabId: selectedId,
      browserUrl: selectedUrl,
    });
  };

  const navigate = () => {
    if (!activeTab || !address.trim()) return;
    window.fzTerminal.browser.navigate(activeTab.id, address);
    setDrafts((current) => {
      const next = { ...current };
      delete next[activeTab.id];
      return next;
    });
  };

  if (!activeTab) return null;

  return (
    <section className="browser-pane multi-browser-pane" data-browser-pane={id}>
      <div className="browser-tab-strip" aria-label="Browser tabs">
        <div className="browser-tab-list">
          {tabs.map((tab) => {
            const state = states[tab.id];
            const active = tab.id === activeTab.id;
            return (
              <button
                className={`browser-page-tab ${active ? "active" : ""}`}
                type="button"
                key={tab.id}
                title={state?.title || tab.title || tab.url}
                onClick={() => commit(tabs, tab.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setTabMenu({
                    tabId: tab.id,
                    position: { x: event.clientX, y: event.clientY },
                  });
                }}
              >
                {state?.loading ? (
                  <LoaderCircle className="spin" size={11} />
                ) : (
                  <Globe2 size={11} />
                )}
                <span>{state?.title || tab.title || "New tab"}</span>
                <i
                  role="button"
                  aria-label="Close browser tab"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeBrowserTab(tab.id);
                  }}
                >
                  <X size={10} />
                </i>
              </button>
            );
          })}
        </div>
        <button
          className="browser-add-tab"
          type="button"
          title="New browser tab"
          onClick={addBrowserTab}
        >
          <Plus size={13} />
        </button>
      </div>

      <header className="browser-toolbar">
        <div className="browser-nav">
          <button
            type="button"
            title="Back"
            disabled={!activeState?.canGoBack}
            onClick={() => window.fzTerminal.browser.back(activeTab.id)}
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            title="Forward"
            disabled={!activeState?.canGoForward}
            onClick={() => window.fzTerminal.browser.forward(activeTab.id)}
          >
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            title="Reload"
            onClick={() => window.fzTerminal.browser.reload(activeTab.id)}
          >
            {activeState?.loading ? (
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
            value={address}
            spellCheck={false}
            aria-label="Browser address"
            onChange={(event) =>
              setDrafts((current) => ({
                ...current,
                [activeTab.id]: event.target.value,
              }))
            }
            onFocus={(event) => event.currentTarget.select()}
          />
        </form>
        <span className="browser-title" title={activeState?.title}>
          {activeState?.title || activeTab.title || "Browser"}
        </span>
      </header>

      <div className="browser-pages">
        {tabs.map((tab) => (
          <BrowserPageView
            key={tab.id}
            tab={tab}
            active={tab.id === activeTab.id}
            visible={
              visible && overlayDepth === 0 && tab.id === activeTab.id
            }
            onState={handlePageState}
            onPaneContextMenu={onPaneContextMenu}
          />
        ))}
      </div>

      <ContextMenu
        open={Boolean(tabMenu)}
        position={tabMenu?.position ?? { x: 0, y: 0 }}
        items={[
          {
            label: "Close browser tab",
            icon: X,
            disabled: tabs.length === 1,
            action: () => {
              if (tabMenu) closeBrowserTab(tabMenu.tabId);
            },
          },
        ]}
        onClose={() => setTabMenu(null)}
      />
    </section>
  );
}

function BrowserPageView({
  tab,
  active,
  visible,
  onState,
  onPaneContextMenu,
}: {
  tab: BrowserPageTab;
  active: boolean;
  visible: boolean;
  onState: (state: BrowserState) => void;
  onPaneContextMenu: (position: MenuPosition) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const readInitialUrl = useEffectEvent(() => tab.url);
  const reportState = useEffectEvent(onState);
  const reportContextMenu = useEffectEvent(onPaneContextMenu);
  const applyCurrentVisibility = useEffectEvent(() => {
    window.fzTerminal.browser.setVisible(tab.id, visible);
  });

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
      if (!disposed && viewport.offsetParent) {
        window.fzTerminal.browser.setBounds(tab.id, readBounds());
      }
    };
    const stopState = window.fzTerminal.browser.onState((next) => {
      if (next.id !== tab.id || disposed) return;
      setError(next.error ?? "");
      reportState(next);
    });
    const stopContextMenu = window.fzTerminal.browser.onContextMenu(
      (value) => {
        if (value.id === tab.id && !disposed) {
          reportContextMenu({ x: value.x, y: value.y });
        }
      },
    );
    const observer = new ResizeObserver(updateBounds);
    observer.observe(viewport);
    void window.fzTerminal.browser
      .create(tab.id, readInitialUrl(), readBounds())
      .then(applyCurrentVisibility);
    const frame = requestAnimationFrame(updateBounds);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      stopState();
      stopContextMenu();
      window.fzTerminal.browser.setVisible(tab.id, false);
    };
  }, [tab.id]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (active && viewport) {
      const frame = requestAnimationFrame(() => {
        const rect = viewport.getBoundingClientRect();
        window.fzTerminal.browser.setBounds(tab.id, {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [active, tab.id]);

  useEffect(() => {
    window.fzTerminal.browser.setVisible(tab.id, visible);
  }, [tab.id, visible]);

  return (
    <div className={`browser-page ${active ? "active" : ""}`} hidden={!active}>
      {error && <div className="browser-error">{error}</div>}
      <div className="browser-viewport" ref={viewportRef}>
        <div className="browser-placeholder">
          <Globe2 size={24} />
          <span>Loading secure browser view…</span>
        </div>
      </div>
    </div>
  );
}
