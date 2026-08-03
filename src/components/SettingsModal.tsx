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
  Palette,
  RefreshCw,
  RotateCcw,
  Settings2,
  TerminalSquare,
} from "lucide-react";
import type {
  CustomPalette,
  CursorStyle,
  ProfileInfo,
  ShortcutAction,
  ThemeId,
} from "../types";
import { useUpdateStatus } from "../hooks/useUpdateStatus";
import { fonts, paletteFromTheme, themes } from "../lib/themes";
import {
  defaultSettings,
  shortcutLabels,
  useAppStore,
} from "../store/appStore";
import { Modal } from "./Modal";
import { SelectMenu } from "./DropdownMenu";
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

const paletteGroups: {
  label: string;
  colors: { key: keyof CustomPalette; label: string }[];
}[] = [
  {
    label: "Interface surfaces",
    colors: [
      { key: "app", label: "Window" },
      { key: "titlebar", label: "Title bar" },
      { key: "sidebar", label: "Command panel" },
      { key: "surface", label: "Panels" },
      { key: "elevated", label: "Raised panels" },
      { key: "hover", label: "Hover" },
      { key: "border", label: "Borders" },
      { key: "borderStrong", label: "Strong borders" },
    ],
  },
  {
    label: "Interface text & signals",
    colors: [
      { key: "text", label: "Primary text" },
      { key: "textMuted", label: "Secondary text" },
      { key: "textFaint", label: "Inactive text" },
      { key: "accent", label: "Accent" },
      { key: "accentHover", label: "Accent hover" },
      { key: "success", label: "Success" },
      { key: "warning", label: "Warning" },
      { key: "danger", label: "Error" },
    ],
  },
  {
    label: "Terminal & ANSI",
    colors: [
      { key: "terminalBackground", label: "Background" },
      { key: "terminalForeground", label: "Foreground" },
      { key: "terminalCursor", label: "Cursor" },
      { key: "terminalSelection", label: "Selection" },
      { key: "ansiBlack", label: "ANSI black" },
      { key: "ansiRed", label: "ANSI red" },
      { key: "ansiGreen", label: "ANSI green" },
      { key: "ansiYellow", label: "ANSI yellow" },
      { key: "ansiBlue", label: "ANSI blue" },
      { key: "ansiMagenta", label: "ANSI magenta" },
      { key: "ansiCyan", label: "ANSI cyan" },
      { key: "ansiWhite", label: "ANSI white" },
    ],
  },
];

export function SettingsModal({
  open,
  initialSection = "general",
  onClose,
  onShowCommands,
}: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [systemFonts, setSystemFonts] = useState<string[]>(() => [
    "system-ui",
    ...Object.values(fonts).map((font) => font.label),
  ]);
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

  useEffect(() => {
    if (!open || section !== "appearance") return;
    let active = true;
    void window.fzTerminal.fonts.list().then((available) => {
      if (!active) return;
      setSystemFonts([
        "system-ui",
        ...new Set([
          ...Object.values(fonts).map((font) => font.label),
          ...available,
        ]),
      ]);
    });
    return () => {
      active = false;
    };
  }, [open, section]);

  return (
    <Modal
      open={open}
      title="Settings"
      subtitle="Personalize the terminal without leaving this window."
      width={980}
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
              description="Every change is previewed immediately and saved locally."
              action={
                <button
                  className="button secondary small"
                  type="button"
                  onClick={() =>
                    updateAppearance(defaultSettings.appearance)
                  }
                >
                  <RotateCcw size={13} />
                  Reset appearance
                </button>
              }
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
                      onClick={() => {
                        const themeId = theme.id as ThemeId;
                        updateAppearance({
                          theme: themeId,
                          ...(settings.appearance.advancedColors
                            ? { customPalette: paletteFromTheme(theme) }
                            : {}),
                        });
                      }}
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
                <SettingRow label="Interface font">
                  <FontFamilyPicker
                    id="ui-font-family"
                    value={settings.appearance.uiFontFamily}
                    fonts={systemFonts}
                    onChange={(uiFontFamily) =>
                      updateAppearance({ uiFontFamily })
                    }
                  />
                </SettingRow>
                <SettingRow label="Terminal font">
                  <FontFamilyPicker
                    id="terminal-font-family"
                    value={settings.appearance.terminalFontFamily}
                    fonts={systemFonts}
                    onChange={(terminalFontFamily) =>
                      updateAppearance({ terminalFontFamily })
                    }
                    monospace
                  />
                </SettingRow>
                <SettingRow
                  label="Interface text size"
                  value={`${settings.appearance.uiFontSize}px`}
                >
                  <input
                    type="range"
                    min={11}
                    max={20}
                    step={1}
                    value={settings.appearance.uiFontSize}
                    onChange={(event) =>
                      updateAppearance({
                        uiFontSize: Number(event.target.value),
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Terminal font size"
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
              </SettingsGroup>
              <SettingsGroup title="Transparency & surfaces">
                <SettingRow
                  label="Interface opacity"
                  value={`${Math.round(
                    settings.appearance.interfaceOpacity * 100,
                  )}%`}
                >
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.01}
                    value={settings.appearance.interfaceOpacity}
                    onChange={(event) =>
                      updateAppearance({
                        interfaceOpacity: Number(event.target.value),
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Terminal background opacity"
                  value={`${Math.round(settings.appearance.opacity * 100)}%`}
                >
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.01}
                    value={settings.appearance.opacity}
                    onChange={(event) =>
                      updateAppearance({
                        opacity: Number(event.target.value),
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Surface blur"
                  value={`${settings.appearance.interfaceBlur}px`}
                >
                  <input
                    type="range"
                    min={0}
                    max={36}
                    step={1}
                    value={settings.appearance.interfaceBlur}
                    onChange={(event) =>
                      updateAppearance({
                        interfaceBlur: Number(event.target.value),
                      })
                    }
                  />
                </SettingRow>
              </SettingsGroup>
              <SettingsGroup title="Geometry & readability">
                <SettingRow
                  label="Corner radius"
                  value={`${settings.appearance.cornerRadius}px`}
                >
                  <input
                    type="range"
                    min={0}
                    max={16}
                    step={1}
                    value={settings.appearance.cornerRadius}
                    onChange={(event) =>
                      updateAppearance({
                        cornerRadius: Number(event.target.value),
                      })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Panel spacing"
                  value={`${settings.appearance.panelGap}px`}
                >
                  <input
                    type="range"
                    min={0}
                    max={14}
                    step={1}
                    value={settings.appearance.panelGap}
                    onChange={(event) =>
                      updateAppearance({
                        panelGap: Number(event.target.value),
                      })
                    }
                  />
                </SettingRow>
                <Toggle
                  checked={settings.appearance.highContrastText}
                  onChange={(highContrastText) =>
                    updateAppearance({ highContrastText })
                  }
                  label="High-contrast secondary text"
                  description="Makes captions, timestamps, shortcuts, and inactive labels easier to read."
                />
                <Toggle
                  checked={settings.appearance.showBackgroundGrid}
                  onChange={(showBackgroundGrid) =>
                    updateAppearance({ showBackgroundGrid })
                  }
                  label="Technical background grid"
                  description="Show the subtle grid behind terminal panels."
                />
              </SettingsGroup>
              <SettingsGroup title="Advanced palette">
                <Toggle
                  checked={settings.appearance.advancedColors}
                  onChange={(advancedColors) =>
                    updateAppearance({ advancedColors })
                  }
                  label="Advanced color mode"
                  description="Tune every semantic interface and terminal color independently."
                />
                {settings.appearance.advancedColors && (
                  <div className="advanced-palette">
                    <div className="palette-toolbar">
                      <span>
                        <Palette size={15} />
                        Changes are applied live
                      </span>
                      <button
                        className="button secondary small"
                        type="button"
                        onClick={() =>
                          updateAppearance({
                            customPalette: paletteFromTheme(
                              themes[settings.appearance.theme],
                            ),
                          })
                        }
                      >
                        <RotateCcw size={12} />
                        Load theme colors
                      </button>
                    </div>
                    {paletteGroups.map((group) => (
                      <section className="palette-section" key={group.label}>
                        <h5>{group.label}</h5>
                        <div className="palette-grid">
                          {group.colors.map((color) => (
                            <label className="palette-color" key={color.key}>
                              <input
                                type="color"
                                value={
                                  settings.appearance.customPalette[color.key]
                                }
                                aria-label={color.label}
                                onChange={(event) =>
                                  updateAppearance({
                                    customPalette: {
                                      ...settings.appearance.customPalette,
                                      [color.key]: event.target.value,
                                    },
                                  })
                                }
                              />
                              <span>
                                <strong>{color.label}</strong>
                                <code>
                                  {settings.appearance.customPalette[
                                    color.key
                                  ].toUpperCase()}
                                </code>
                              </span>
                            </label>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
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
                  <SelectMenu
                    value={settings.terminal.cursorStyle}
                    ariaLabel="Cursor style"
                    options={[
                      { value: "block", label: "Block" },
                      { value: "bar", label: "Bar" },
                      { value: "underline", label: "Underline" },
                    ]}
                    onChange={(cursorStyle) =>
                      updateTerminal({
                        cursorStyle: cursorStyle as CursorStyle,
                      })
                    }
                  />
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
                  description="Mouse selections and Ctrl+A selections are copied to the clipboard immediately."
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
                  label="File search popup on Tab"
                  description="Shows files from the terminal’s current local or SSH directory. Turn it off to send Tab directly to the active shell."
                />
                <Toggle
                  checked={settings.terminal.screenScrollMode}
                  onChange={(screenScrollMode) =>
                    updateTerminal({ screenScrollMode })
                  }
                  label="GNU Screen wheel mode"
                  description="When enabled, detected GNU Screen sessions automatically use the mouse wheel for copy-mode history. When disabled, no automatic Screen behavior is applied."
                />
              </SettingsGroup>
              <SettingsGroup title="Color behavior">
                <div className="ansi-note">
                  <Command size={16} />
                  <div>
                    <strong>Truecolor and semantic ANSI colors are enabled</strong>
                    <p>
                      Errors, warnings, success messages, Git output, and
                      full-screen apps use the selected theme’s ANSI palette.
                      System color-emoji fonts are used as a fallback.
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

function FontFamilyPicker({
  id,
  value,
  fonts,
  monospace = false,
  onChange,
}: {
  id: string;
  value: string;
  fonts: string[];
  monospace?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="font-family-picker">
      <input
        list={`${id}-options`}
        value={value}
        spellCheck={false}
        aria-label={monospace ? "Terminal font family" : "Interface font family"}
        style={{
          fontFamily:
            value === "system-ui"
              ? "system-ui"
              : `"${value}", ${monospace ? "monospace" : "sans-serif"}`,
        }}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={`${id}-options`}>
        {fonts.map((font) => (
          <option value={font} key={font} />
        ))}
      </datalist>
      <small>{fonts.length - 1} installed fonts detected</small>
    </div>
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
