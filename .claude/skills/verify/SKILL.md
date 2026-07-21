---
name: verify
description: How to build, launch, and drive Anvyll (Windows Electron tray app with global hotkey) to verify changes at runtime.
---

# Verifying Anvyll

## Gotchas (read first)
- **Unset `ELECTRON_RUN_AS_NODE` before launching Electron.** Agent shells inside the VS Code/Cursor extension host inherit `ELECTRON_RUN_AS_NODE=1`, which makes `electron .` run as plain Node and crash with `Cannot read properties of undefined (reading 'whenReady')`. Fix: `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction Ignore` in the same session.
- **Check for an already-running instance first**: `Get-CimInstance Win32_Process -Filter "Name='electron.exe'"` — the user often has the app resident in the tray. It holds the global hotkey and the settings store; stop it before launching your own (`Stop-Process`), and relaunch it detached when done.
- **The settings store** is `%APPDATA%\anvyll\anvyll.store.json` (pretty-printed, `"key": "value"` with spaces). Back it up before mutating. Edit it with `[IO.File]::ReadAllText/WriteAllText` + string `.Replace(...)` — PowerShell 5.1 `Set-Content -Encoding utf8` writes a BOM and `ConvertTo-Json` restructures the file, either of which makes the whole store unparseable (app then silently falls back to defaults, invalidating the test).

## Build / launch
- `npm run build` — vite renderer + `tsc -p tsconfig.electron.json` (this is the typecheck).
- `npm run dev` (background task) — vite + Electron in dev mode. **Dev mode is the observable launch**: `VITE_DEV_SERVER_URL` makes the main process log capture timings (`overlay shell`, `deliver`, `hotkey total`), `SETTINGS_GET` payloads, and starts the dev bridge on `http://127.0.0.1:5174` (`GET /api/settings` works from the shell).
- Plain resident launch (how the user runs it): `Start-Process node_modules\electron\dist\electron.exe -ArgumentList "." -WorkingDirectory <repo>` — detached, survives the session.

## Driving it
- **Global hotkey**: `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^+o")` reaches `globalShortcut` fine (`^`=Ctrl, `+`=Shift, `%`=Alt, `{F9}` etc.). Evidence of a successful fire is the dev-mode log line `[Anvyll] hotkey total: Nms`. The hotkey toggles the overlay — send it again to close. The capture snapshot can take up to ~30s depending on the foreground window; poll the log.
- **Hotkey config changes**: edit `settings.hotkey` in the store JSON (app stopped), relaunch, then SendKeys the combo. Startup healing of an invalid stored hotkey logs `Anvyll: stored hotkey "..." failed (...); reverting to default`.
- The Settings/Studio UI has no scripted driver; UI-level checks are manual (tray → Settings).

## Cleanup
Stop your instance, restore the store backup, relaunch detached so the user's tray app is back.
