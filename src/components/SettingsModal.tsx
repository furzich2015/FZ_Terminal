import { useEffect, useState } from "react";
import {
  AlertCircle,
  AppWindow,
  Brush,
  CheckCircle2,
  Command,
  ExternalLink,
  FolderCog,
  HardDrive,
  Keyboard,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Settings2,
  TerminalSquare,
} from "lucide-react";
import type {
  CursorStyle,
  FontId,
  ProfileInfo,
  ShortcutAction,
  ThemeId,
} from "../types";
import { useUpdateStatus } from "../hooks/useUpdateStatus";
import { fonts, themes } from "../lib/themes";
import { shortcutLabels, useAppStore } from "../store/appStore";
import { Modal } from "./Modal";
import { Toggle } from "./Toggle";

export type SettingsSection =
  | "general"
  | "appearance"
  | "terminal"
  | "shortcuts"
  | "commands"
  | "updates";

interface SettingsModalProps {
  open: boolean;
  initialSection?: SettingsSection;
  onClose: () => void;
  onShowCommands: () => void;
}

const sections: {
  id: SettingsSection;
  label: string;
  icon: typeof Settings2;
}[] = [
  { id: "general", label: "General", icon: AppWindow },
  { id: "appearance", label: "Appearance", icon: Brush },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "commands", label: "Commands", icon: FolderCog },
  { id: "updates", label: "Updates", icon: RefreshCw },
];

export function SettingsModal({
  open,
  initialSection = "general",
  onClose,
  onShowCommands,
}: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const updateStatus = useUpdateStatus();
  const settings = useAppStore((state) => state.settings);
  const commandGroups = useAppStore((state) => state.commandGroups);
  const updateGeneral = useAppStore((state) => state.updateGeneral);
  const updateAppearance = useAppStore((state) => state.updateAppearance);
  const updateTerminal = useAppStore((state) => state.updateTerminal);
  const setShortcut = useAppStore((state) => state.setShortcut);
  const resetShortcuts = useAppStore((state) => state.resetShortcuts);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void window.fzTerminal.profile.info().then((info) => {
      if (active) setProfileInfo(info);
    });
    return () => {
      active = false;
    };
  }, [open]);

  return (
    <Modal
      open={open}
      title="Settings"
      subtitle="Personalize the terminal without leaving this window."
      width={860}
      onClose={onClose}
    >
      <div className="settings-layout">
        <nav className="settings-nav">
          {sections.map((item) => (
            <button
              className={section === item.id ? "active" : ""}
              type="button"
              key={item.id}
              onClick={() => setSection(item.id)}
            >
              <item.icon size={15} />
              <span>{item.label}</span>
            </button>
          ))}
          <div className="settings-nav-footer">
            <span>FZ Terminal</span>
            <small>
              v{updateStatus.currentVersion} · Electron 43 · xterm 6
            </small>
          </div>
        </nav>

        <div className="settings-content">
          {section === "general" && (
            <SettingsPage
              eyebrow="Application"
              title="General"
              description="Control how the desktop application behaves."
            >
              <SettingsGroup title="Startup">
                <Toggle
                  checked={settings.general.restoreSession}
                  onChange={(restoreSession) =>
                    updateGeneral({ restoreSession })
                  }
                  label="Restore the previous session"
                  description="Recreate workspaces, tabs, and split layouts at startup."
                />
                <Toggle
                  checked={settings.general.confirmBeforeClose}
                  onChange={(confirmBeforeClose) =>
                    updateGeneral({ confirmBeforeClose })
                  }
                  label="Confirm before closing"
                  description="Ask before closing tabs and workspaces with running shells."
                />
              </SettingsGroup>
              <SettingsGroup title="Interface">
                <Toggle
                  checked={settings.general.compactInterface}
                  onChange={(compactInterface) =>
                    updateGeneral({ compactInterface })
                  }
                  label="Compact interface"
                  description="Use tighter title bars, tabs, and command rows."
                />
              </SettingsGroup>
            </SettingsPage>
          )}

          {section === "appearance" && (
            <SettingsPage
              eyebrow="Visual style"
              title="Appearance"
              description="Themes affect both the app chrome and ANSI terminal colors."
            >
              <SettingsGroup title="Theme">
                <div className="theme-grid">
                  {Object.values(themes).map((theme) => (
                    <button
                      className={`theme-card ${
                        settings.appearance.theme === theme.id ? "active" : ""
                      }`}
                      type="button"
                      key={theme.id}
                      onClick={() =>
                        updateAppearance({ theme: theme.id as ThemeId })
                      }
                    >
                      <span className="theme-preview">
                        {theme.swatches.map((color) => (
                          <span
                            style={{ background: color }}
                            key={color}
                          />
                        ))}
                      </span>
                      <strong>{theme.label}</strong>
                      <small>{theme.description}</small>
                    </button>
                  ))}
                </div>
              </SettingsGroup>
              <SettingsGroup title="Typography">
                <SettingRow
                  label="Interface text"
                  value={`${settings.appearance.uiFontSize}px`}
                >
                  <input
                    type="range"
                    min={9}
                    max={16}
                    step={1}
                    value={settings.appearance.uiFontSize}
                    onChange={(event) =>
                      updateAppearance({
                        uiFontSize: Number(event.target.value),
                      })
                    }
                  />
                </SettingRow>
                <SettingRow label="Font family">
                  <select
                    value={settings.appearance.font}
                    onChange={(event) =>
                      updateAppearance({
                        font: event.target.value as FontId,
                      })
                    }
                  >
                    {Object.entries(fonts).map(([id, font]) => (
                      <option value={id} key={id}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow
                  label="Font size"
                  value={`${settings.appearance.fontSize}px`}
                >
                  <input
                    type="range"
                    min={10}
                    max={24}
                    step={1}
                    value={settings.appearance.fontSize}
                    onChange={(event) =>
                      updateAppearance({
                        fontSize: Number(event.target.value),
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Line height"
                  value={settings.appearance.lineHeight.toFixed(2)}
                >
                  <input
                    type="range"
                    min={1}
                    max={1.7}
                    step={0.05}
                    value={settings.appearance.lineHeight}
                    onChange={(event) =>
                      updateAppearance({
                        lineHeight: Number(event.target.value),
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Terminal opacity"
                  value={`${Math.round(settings.appearance.opacity * 100)}%`}
                >
                  <input
                    type="range"
                    min={0.7}
                    max={1}
                    step={0.02}
                    value={settings.appearance.opacity}
                    onChange={(event) =>
                      updateAppearance({
                        opacity: Number(event.target.value),
                      })
                    }
                  />
                </SettingRow>
              </SettingsGroup>
            </SettingsPage>
          )}

          {section === "terminal" && (
            <SettingsPage
              eyebrow="Shell & rendering"
              title="Terminal"
              description="Configure PTY sessions and xterm rendering."
            >
              <SettingsGroup title="Shell">
                <label className="field">
                  <span>Shell executable</span>
                  <input
                    value={settings.terminal.shell}
                    placeholder="Use system default"
                    onChange={(event) =>
                      updateTerminal({ shell: event.target.value })
                    }
                  />
                  <small>
                    Leave blank to use $SHELL on Linux/macOS or PowerShell on
                    Windows. Applies to new panes.
                  </small>
                </label>
              </SettingsGroup>
              <SettingsGroup title="Display">
                <SettingRow label="Cursor style">
                  <select
                    value={settings.terminal.cursorStyle}
                    onChange={(event) =>
                      updateTerminal({
                        cursorStyle: event.target.value as CursorStyle,
                      })
                    }
                  >
                    <option value="block">Block</option>
                    <option value="bar">Bar</option>
                    <option value="underline">Underline</option>
                  </select>
                </SettingRow>
                <Toggle
                  checked={settings.terminal.cursorBlink}
                  onChange={(cursorBlink) =>
                    updateTerminal({ cursorBlink })
                  }
                  label="Blinking cursor"
                />
                <SettingRow
                  label="Scrollback"
                  value={`${settings.terminal.scrollback.toLocaleString()} lines`}
                >
                  <input
                    type="range"
                    min={1000}
                    max={500000}
                    step={1000}
                    value={settings.terminal.scrollback}
                    onChange={(event) =>
                      updateTerminal({
                        scrollback: Number(event.target.value),
                      })
                    }
                  />
                </SettingRow>
                <Toggle
                  checked={settings.terminal.copyOnSelect}
                  onChange={(copyOnSelect) =>
                    updateTerminal({ copyOnSelect })
                  }
                  label="Copy text when selected"
                />
              </SettingsGroup>
              <SettingsGroup title="Search highlighting">
                <Toggle
                  checked={settings.terminal.searchHighlightAll}
                  onChange={(searchHighlightAll) =>
                    updateTerminal({ searchHighlightAll })
                  }
                  label="Highlight all exact matches"
                  description="Ctrl+F marks every exact, case-sensitive match in the terminal buffer."
                />
                <SettingRow
                  label="Highlight color"
                  value={settings.terminal.searchHighlightColor.toUpperCase()}
                >
                  <label className="search-color-control">
                    <input
                      type="color"
                      value={settings.terminal.searchHighlightColor}
                      disabled={!settings.terminal.searchHighlightAll}
                      aria-label="Terminal search highlight color"
                      onChange={(event) =>
                        updateTerminal({
                          searchHighlightColor: event.target.value,
                        })
                      }
                    />
                    <span
                      style={{
                        background: settings.terminal.searchHighlightColor,
                      }}
                    />
                  </label>
                </SettingRow>
              </SettingsGroup>
              <SettingsGroup title="Remote sessions & completion">
                <Toggle
                  checked={settings.terminal.fileCompletion}
                  onChange={(fileCompletion) =>
                    updateTerminal({ fileCompletion })
                  }
                  label="Shell-native file completion"
                  description="Tab opens local suggestions only in a local shell. During SSH, local suggestions are disabled and Tab is forwarded to the remote server."
                />
                <Toggle
                  checked={settings.terminal.screenScrollMode}
                  onChange={(screenScrollMode) =>
                    updateTerminal({ screenScrollMode })
                  }
                  label="GNU Screen wheel mode"
                  description="Use the mouse wheel to enter Screen copy mode and scroll its history. You can override this for one pane from its right-click menu."
                />
              </SettingsGroup>
              <SettingsGroup title="Color behavior">
                <div className="ansi-note">
                  <Command size={16} />
                  <div>
                    <strong>Truecolor and semantic ANSI colors are enabled</strong>
                    <p>
                      Errors, warnings, success messages, Git output, and
                      full-screen apps keep their original 24-bit colors.
                    </p>
                  </div>
                </div>
              </SettingsGroup>
            </SettingsPage>
          )}

          {section === "shortcuts" && (
            <SettingsPage
              eyebrow="Keyboard"
              title="Shortcuts"
              description="Click a shortcut and press a new key combination."
              action={
                <button
                  className="button secondary small"
                  type="button"
                  onClick={resetShortcuts}
                >
                  <RotateCcw size={13} />
                  Restore defaults
                </button>
              }
            >
              <SettingsGroup title="Application shortcuts">
                <div className="shortcut-list">
                  {(Object.keys(shortcutLabels) as ShortcutAction[]).map(
                    (action) => (
                      <ShortcutRecorder
                        action={action}
                        label={shortcutLabels[action]}
                        value={settings.shortcuts[action]}
                        onChange={(value) => setShortcut(action, value)}
                        key={action}
                      />
                    ),
                  )}
                </div>
              </SettingsGroup>
            </SettingsPage>
          )}

          {section === "commands" && (
            <SettingsPage
              eyebrow="Automation"
              title="Commands"
              description="Organize reusable shell commands into folders."
            >
              <SettingsGroup title="Library summary">
                <div className="command-summary">
                  <div>
                    <strong>{commandGroups.length}</strong>
                    <span>Folders</span>
                  </div>
                  <div>
                    <strong>
                      {commandGroups.reduce(
                        (count, group) => count + group.commands.length,
                        0,
                      )}
                    </strong>
                    <span>Commands</span>
                  </div>
                </div>
                <p className="settings-help">
                  Add, rename, or remove folders and commands from the sidebar.
                  Every command is also available in the terminal right-click
                  menu.
                </p>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    onShowCommands();
                    onClose();
                  }}
                >
                  <FolderCog size={14} />
                  Open command library
                </button>
              </SettingsGroup>
            </SettingsPage>
          )}

          {section === "updates" && (
            <SettingsPage
              eyebrow="Maintenance"
              title="Updates"
              description="Updates download in the background and install automatically on the next safe exit."
            >
              <SettingsGroup title="Application version">
                <div className="update-status">
                  <span
                    className={`update-status-icon ${updateStatus.state}`}
                  >
                    {updateStatus.state === "checking" ||
                    updateStatus.state === "downloading" ? (
                      <LoaderCircle size={17} />
                    ) : updateStatus.state === "error" ? (
                      <AlertCircle size={17} />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}
                  </span>
                  <div>
                    <strong>
                      FZ Terminal {updateStatus.currentVersion}
                    </strong>
                    <p>{updateStatus.message}</p>
                  </div>
                </div>
                {updateStatus.state === "downloading" && (
                  <div
                    className="update-progress"
                    aria-label={`Update download ${Math.round(
                      updateStatus.progress ?? 0,
                    )}%`}
                  >
                    <span
                      style={{ width: `${updateStatus.progress ?? 0}%` }}
                    />
                  </div>
                )}
                <div className="update-actions">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={
                      updateStatus.state === "development" ||
                      updateStatus.state === "checking" ||
                      updateStatus.state === "downloading"
                    }
                    onClick={() => void window.fzTerminal.updates.check()}
                  >
                    <RefreshCw size={14} />
                    Check for updates
                  </button>
                  {updateStatus.state === "downloaded" && (
                    <button
                      className="button primary"
                      type="button"
                      onClick={window.fzTerminal.updates.install}
                    >
                      <RefreshCw size={14} />
                      Restart and install
                    </button>
                  )}
                  <button
                    className="button secondary"
                    type="button"
                    onClick={window.fzTerminal.updates.openReleases}
                  >
                    <ExternalLink size={14} />
                    Releases
                  </button>
                </div>
              </SettingsGroup>

              <SettingsGroup title="Shared application profile">
                <div className="profile-status">
                  <HardDrive size={17} />
                  <div>
                    <strong>Development and installed builds stay in sync</strong>
                    <p>
                      Workspaces, tabs, command folders, preferences, and
                      command-block history use the same Linux user profile.
                    </p>
                  </div>
                </div>
                {profileInfo && (
                  <div className="profile-paths">
                    <span>Profile</span>
                    <code>{profileInfo.userDataPath}</code>
                    <span>Backup</span>
                    <code>{profileInfo.backupPath}</code>
                    {profileInfo.savedAt && (
                      <>
                        <span>Last backup</span>
                        <code>
                          {new Date(profileInfo.savedAt).toLocaleString()}
                        </code>
                      </>
                    )}
                  </div>
                )}
              </SettingsGroup>
            </SettingsPage>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SettingsPage({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-group">
      <h4>{title}</h4>
      <div className="settings-group-card">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
        {value && <small>{value}</small>}
      </span>
      {children}
    </label>
  );
}

function ShortcutRecorder({
  action,
  label,
  value,
  onChange,
}: {
  action: ShortcutAction;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }
      if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
      onChange(shortcutFromEvent(event));
      setRecording(false);
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [onChange, recording]);

  return (
    <div className="shortcut-row">
      <span>{label}</span>
      <button
        className={`shortcut-recorder ${recording ? "recording" : ""}`}
        type="button"
        data-action={action}
        onClick={() => setRecording(true)}
      >
        {recording ? "Press shortcut…" : prettifyShortcut(value)}
      </button>
    </div>
  );
}

function shortcutFromEvent(event: KeyboardEvent) {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Primary");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const key =
    event.key.length === 1
      ? event.key.toUpperCase()
      : event.key.replace("Arrow", "Arrow");
  parts.push(key);
  return parts.join("+");
}

function prettifyShortcut(value: string) {
  return value
    .replace("Primary", navigator.platform.includes("Mac") ? "⌘" : "Ctrl")
    .replaceAll("+", "  ");
}
