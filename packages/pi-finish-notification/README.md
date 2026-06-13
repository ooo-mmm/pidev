# pi-finish-notification

Sends native macOS/terminal notifications with sound when pi finishes. No config, no frills — just works.

Only triggers when the terminal window is **not** active, so you only get notified when you're in another app.

Supports:
- **macOS native:** Notification Center with sound via `osascript`
- **Linux native:** `notify-send` (libnotify / D-Bus)
- **Terminal escape sequences:** OSC 777 (Ghostty, iTerm2, WezTerm, rxvt-unicode) and OSC 99 (Kitty)
- **Bell:** universal fallback

## Install

```bash
pi install npm:pi-finish-notification
```

Then restart pi, or run `/reload`.

That's it. No config files, no environment variables, no setup. Install and move on.

## What it does

- Detects the best notification backend automatically (osascript > notify-send > Kitty > OSC 777 > bell)
- Checks if your terminal window is focused — if you're looking at pi, no notification needed
- On macOS, plays a notification sound so you hear it even with the screen off

## Advanced (optional)

| Environment variable | What it does |
|---|---|
| `PI_NOTIFY_DISABLE=1` | Disable all notifications |
| `PI_NOTIFY_SOUND=0` | Disable sound only |
| `PI_NOTIFY_SOUND_NAME=Glass` | Custom macOS sound name |
| `PI_NOTIFY_FORCE_METHOD=osascript` | Force a specific backend |
