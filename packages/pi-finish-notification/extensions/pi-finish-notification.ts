/**
 * pi-finish-notification
 *
 * Sends native macOS/terminal notifications with sound when the agent finishes.
 *
 * Supported notification methods (auto-detected):
 *   - macOS native: osascript (Notification Center with sound support)
 *   - Linux native: notify-send (libnotify / D-Bus)
 *   - OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
 *   - OSC 99: Kitty
 *
 * Configuration via environment variables:
 *   PI_NOTIFY_DISABLE=1             Disable all notifications
 *   PI_NOTIFY_SOUND=0               Disable sound (default: true)
 *   PI_NOTIFY_SOUND_NAME=           Custom macOS sound name (default: system default)
 *   PI_NOTIFY_FORCE_METHOD=         Force: "osascript" | "notify-send" | "osc777" | "osc99"
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ─── Configuration ──────────────────────────────────────────────────────────────

function isEnabled(key: string, def: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return def;
  return raw !== "0" && raw !== "false" && raw !== "";
}

const CFG = {
  disable: isEnabled("PI_NOTIFY_DISABLE", false),
  sound: isEnabled("PI_NOTIFY_SOUND", true),
  soundName: process.env["PI_NOTIFY_SOUND_NAME"] ?? null,
  forceMethod: process.env["PI_NOTIFY_FORCE_METHOD"]?.toLowerCase() ?? null,
};

// ─── Notification Backends ──────────────────────────────────────────────────────

type NotifyFn = (title: string, body: string) => void;

function esq(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** macOS native Notification Center via osascript (supports sound) */
function notifyOsascript(title: string, body: string): void {
  const t = esq(title);
  const b = esq(body);
  const { execSync } = require("child_process");

  let soundArg = "";
  if (CFG.sound) {
    const name = CFG.soundName
      ? `sound name "${esq(CFG.soundName)}"`
      : "sound name \"default\"";
    soundArg = ` ${name}`;
  }

  try {
    execSync(
      `osascript -e 'display notification "${b}" with title "${t}"${soundArg}'`,
      { stdio: "ignore", timeout: 3000 },
    );
  } catch {
    // Silently ignore — terminal or headless session might not support it
  }
}

/** Linux native via notify-send (libnotify / D-Bus) */
function notifySend(title: string, body: string): void {
  const { execSync } = require("child_process");
  const args = ["notify-send", title, body];
  if (CFG.sound) {
    args.push("--hint=int:transient:1");
  }
  try {
    execSync(args.join(" "), { stdio: "ignore", timeout: 3000 });
  } catch {
    // Silently ignore
  }
}

/** Terminal bell — universal fallback when nothing else works */
function notifyBell(): void {
  process.stdout.write("\x07");
}

/** OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode */
function notifyOSC777(title: string, body: string): void {
  process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

/** OSC 99: Kitty */
function notifyOSC99(title: string, body: string): void {
  process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
  process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
}

// ─── Detection ──────────────────────────────────────────────────────────────────

interface Backend {
  notify: NotifyFn;
  label: string;
}

let _detected: Backend | null = null;

function detectBackend(): Backend {
  if (_detected) return _detected;

  // Force method
  if (CFG.forceMethod === "osascript")  return (_detected = { notify: notifyOsascript, label: "osascript" });
  if (CFG.forceMethod === "notify-send") return (_detected = { notify: notifySend, label: "notify-send" });
  if (CFG.forceMethod === "osc777")     return (_detected = { notify: notifyOSC777, label: "osc777" });
  if (CFG.forceMethod === "osc99")      return (_detected = { notify: notifyOSC99, label: "osc99" });
  if (CFG.forceMethod === "bell")       return (_detected = { notify: notifyBell as unknown as NotifyFn, label: "bell" });

  const { execSync, execFileSync } = require("child_process");
  const which = (bin: string): boolean => {
    try { execFileSync("which", [bin], { stdio: "ignore" }); return true; } catch { return false; }
  };

  // macOS native with sound
  if (process.platform === "darwin" && which("osascript")) {
    return (_detected = { notify: notifyOsascript, label: "osascript" });
  }

  // Linux native
  if ((process.platform === "linux" || process.env["WSL_DISTRO_NAME"]) && which("notify-send")) {
    return (_detected = { notify: notifySend, label: "notify-send" });
  }

  // Kitty
  if (process.env["KITTY_WINDOW_ID"]) return (_detected = { notify: notifyOSC99, label: "osc99" });

  // OSC 777 fallback — works in most modern terminals
  return (_detected = { notify: notifyOSC777, label: "osc777" });
}

// ─── Window Focus Detection ─────────────────────────────────────────────────────

/** Check if the terminal window is currently the active/focused window */
function isTerminalFocused(): boolean {
  try {
    const { execSync } = require("child_process");
    const output = execSync(
      `osascript -e 'tell application "System Events" to return name of first application process whose frontmost is true'`,
      { stdio: "pipe", timeout: 1000, encoding: "utf8" },
    ).trim();
    // Check if the frontmost app is a terminal emulator
    const terminalApps = [
      "Terminal",
      "iTerm2",
      "Ghostty",
      "kitty",
      "WezTerm",
      "Warp",
      "Alacritty",
      "Hyper",
      "Tabby",
    ];
    return terminalApps.some((app) => output === app || output.startsWith(app));
  } catch {
    return true; // On error, allow notification (don't suppress)
  }
}

/** Check if the terminal window is focused (cross-platform) */
function isTerminalActive(): boolean {
  // macOS: use osascript + System Events
  if (process.platform === "darwin") {
    return isTerminalFocused();
  }
  // Linux / other: no reliable way to detect; always consider active
  return true;
}

// ─── Main Notify ────────────────────────────────────────────────────────────────

function sendNotification(title: string, body: string): void {
  // Only notify if the terminal window is NOT active
  if (isTerminalActive()) return;

  try {
    const backend = detectBackend();
    backend.notify(title, body);
    // Ring terminal bell as well when not using a native backend with sound
    if (CFG.sound && backend.label !== "osascript" && backend.label !== "notify-send") {
      notifyBell();
    }
  } catch {
    // best-effort
  }
}

// ─── Extension ──────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  if (CFG.disable) return;

  const toolStartTimes = new Map<string, number>();

  // ─── Agent end: ready for input ───────────────────────────────────────────────
  pi.on("agent_end", async () => {
    sendNotification("Pi — Done", "Agent finished, ready for input.");
  });

  // ─── Session start info ───────────────────────────────────────────────────────
  pi.on("session_start", (_event, ctx) => {
    if (ctx.hasUI) {
      const backend = detectBackend();
      ctx.ui.notify(
        `Notifications ready (${backend.label}${CFG.sound ? ", sound: on" : ""})`,
        "info",
      );
    }
  });
}
