# Shared terminal focus, keyboard input, and clipboard helpers for PromptForge PS scripts.
#
# AGENTS: This file DEFINES the shared `WinFg` C# type. Any script that dot-sources this file
# (win-hotkey-snapshot.ps1, win-inject.ps1, ...) must NOT define its own `WinFg` unguarded —
# a duplicate Add-Type throws TYPE_ALREADY_EXISTS under $ErrorActionPreference='Stop'.
# If you add helpers here, prefer extending this WinFg rather than redefining it elsewhere.
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WinFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  public const uint WM_GETOBJECT = 0x003D;
  public const int OBJID_CLIENT = unchecked((int)0xFFFFFFFC);

  public static void FocusWindow(IntPtr hWnd) {
    IntPtr fg = GetForegroundWindow();
    uint pidIgnore;
    uint fgThread = GetWindowThreadProcessId(fg, out pidIgnore);
    uint targetThread = GetWindowThreadProcessId(hWnd, out pidIgnore);
    if (fgThread != targetThread) AttachThreadInput(fgThread, targetThread, true);
    if (IsIconic(hWnd)) ShowWindow(hWnd, 9);
    SetForegroundWindow(hWnd);
    if (fgThread != targetThread) AttachThreadInput(fgThread, targetThread, false);
  }

  public static void WithTargetInput(IntPtr topLevel, Action action) {
    IntPtr fg = GetForegroundWindow();
    uint pidIgnore;
    uint fgThread = GetWindowThreadProcessId(fg, out pidIgnore);
    uint targetThread = GetWindowThreadProcessId(topLevel, out pidIgnore);
    bool attached = false;
    if (fgThread != targetThread) {
      AttachThreadInput(fgThread, targetThread, true);
      attached = true;
    }
    try { action(); }
    finally {
      if (attached) AttachThreadInput(fgThread, targetThread, false);
    }
  }

  public static void Click(int x, int y) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(30);
    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, IntPtr.Zero);
    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, IntPtr.Zero);
  }

  public static void RightClick(int x, int y) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(30);
    mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, IntPtr.Zero);
    mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, IntPtr.Zero);
  }

  public static void SendKey(byte keyVk) {
    const uint KEYUP = 0x0002;
    keybd_event(keyVk, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, KEYUP, UIntPtr.Zero);
  }

  public static void SendShiftCombo(byte keyVk) {
    const uint KEYUP = 0x0002;
    keybd_event(0x10, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, KEYUP, UIntPtr.Zero);
    keybd_event(0x10, 0, KEYUP, UIntPtr.Zero);
  }

  public static void SendCtrlCombo(byte keyVk) {
    const uint KEYUP = 0x0002;
    keybd_event(0x11, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, KEYUP, UIntPtr.Zero);
    keybd_event(0x11, 0, KEYUP, UIntPtr.Zero);
  }

  public static void SendCtrlShiftCombo(byte keyVk) {
    const uint KEYUP = 0x0002;
    keybd_event(0x11, 0, 0, UIntPtr.Zero);
    keybd_event(0x10, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, KEYUP, UIntPtr.Zero);
    keybd_event(0x10, 0, KEYUP, UIntPtr.Zero);
    keybd_event(0x11, 0, KEYUP, UIntPtr.Zero);
  }

  public static void ActivateChromiumAccessibility(IntPtr top) {
    IntPtr render = FindWindowEx(top, IntPtr.Zero, "Chrome_RenderWidgetHostHWND1", null);
    if (render != IntPtr.Zero) {
      SendMessage(render, WM_GETOBJECT, IntPtr.Zero, new IntPtr(OBJID_CLIENT));
    }
  }
}
'@ -ErrorAction SilentlyContinue

function Test-TerminalPaneElement($el) {
  if ($null -eq $el) { return $false }
  try {
    $name = $el.Current.Name
    if ($name -match '(?i)^Terminal \d+') { return $true }
    $aid = $el.Current.AutomationId
    if ($aid -match '(?i)terminal|xterm') { return $true }
    $cls = $el.Current.ClassName
    if ($cls -match '(?i)terminal|xterm') { return $true }
  } catch {}
  return $false
}

function Resolve-TerminalPaneElement($el) {
  if ($null -eq $el) { return $null }
  if (Test-TerminalPaneElement $el) { return $el }
  $cur = $el
  for ($i = 0; $i -lt 12 -and $null -ne $cur; $i++) {
    try { $cur = $cur.GetParent() } catch { break }
    if ($null -eq $cur) { break }
    if (Test-TerminalPaneElement $cur) { return $cur }
  }
  return $el
}

function Test-IsIntegratedTerminalHostByProcess([string]$processName) {
  $proc = if ($processName) { $processName } else { "" }
  $proc = $proc.ToLowerInvariant() -replace '\.exe$', ''
  return $proc -in @('cursor', 'code', 'code - insiders')
}

# Native hosts (Windows Terminal, conhost) paste on right-click; integrated panes use context menu.
function Test-IsTerminalRightClickPasteHost([bool]$useIntegratedCopy) {
  return -not $useIntegratedCopy
}

function Invoke-TerminalRightClickPaste([long]$hwnd, $bounds) {
  $norm = Get-NormalizedBounds $bounds
  if ($null -eq $norm) { return $false }
  $x = [int](($norm.left + $norm.right) / 2)
  $y = [int]($norm.bottom - 24)
  if ($x -le 0 -or $y -le 0) { return $false }
  $top = [IntPtr]::new($hwnd)
  [WinFg]::WithTargetInput($top, { [WinFg]::RightClick($x, $y) })
  Start-Sleep -Milliseconds 150
  return $true
}

function Get-WindowProcessName([long]$hwnd) {
  try {
    $winPid = [uint32]0
    [void][WinFg]::GetWindowThreadProcessId([IntPtr]::new($hwnd), [ref]$winPid)
    if ($winPid -gt 0) {
      return (Get-Process -Id $winPid -ErrorAction SilentlyContinue).ProcessName
    }
  } catch {}
  return ""
}

function Get-NormalizedBounds($bounds) {
  if ($null -eq $bounds) { return $null }
  try {
    $left = [double]$bounds.left
    $top = [double]$bounds.top
    $right = [double]$bounds.right
    $bottom = [double]$bounds.bottom
    if ($right -le $left -or $bottom -le $top) { return $null }
    return @{ left = $left; top = $top; right = $right; bottom = $bottom }
  } catch {}
  return $null
}

function Get-TerminalPaneBoundsFromElement($el) {
  if ($null -eq $el) { return $null }
  try {
    $pane = Resolve-TerminalPaneElement $el
    if ($null -eq $pane) { return $null }
    $rect = $pane.Current.BoundingRectangle
    if ($rect.Width -le 0 -or $rect.Height -le 0) { return $null }
    return @{
      left   = [double]$rect.Left
      top    = [double]$rect.Top
      right  = [double]$rect.Right
      bottom = [double]$rect.Bottom
    }
  } catch {}
  return $null
}

function Click-TerminalPromptPoint([IntPtr]$top, $bounds) {
  $norm = Get-NormalizedBounds $bounds
  if ($null -eq $norm) { return }
  $x = [int](($norm.left + $norm.right) / 2)
  $y = [int]($norm.bottom - 24)
  if ($x -le 0 -or $y -le 0) { return }
  [WinFg]::WithTargetInput($top, { [WinFg]::Click($x, $y) })
  Start-Sleep -Milliseconds 80
}

function Focus-TerminalPane([long]$topHwnd, $el = $null, $bounds = $null, [string]$processName = "") {
  $top = [IntPtr]::new($topHwnd)
  [WinFg]::FocusWindow($top)
  Start-Sleep -Milliseconds 100

  $proc = if ($processName) { $processName } else { Get-WindowProcessName $topHwnd }
  if (Test-IsIntegratedTerminalHostByProcess $proc) {
    try {
      [WinFg]::ActivateChromiumAccessibility($top)
      Start-Sleep -Milliseconds 60
    } catch {}
  }

  $paneEl = $null
  if ($null -ne $el) {
    $paneEl = Resolve-TerminalPaneElement $el
  } else {
    try {
      $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
      $paneEl = Resolve-TerminalPaneElement $focused
    } catch {}
  }

  if ($null -ne $paneEl) {
    try { $paneEl.SetFocus() } catch {}
    Start-Sleep -Milliseconds 60
  }

  $clickBounds = Get-NormalizedBounds $bounds
  if ($null -eq $clickBounds -and $null -ne $paneEl) {
    $clickBounds = Get-TerminalPaneBoundsFromElement $paneEl
  }
  if ($null -ne $clickBounds) {
    Click-TerminalPromptPoint $top $clickBounds
  }
}

function Invoke-WithTargetKeys([long]$hwnd, [scriptblock]$action) {
  $top = [IntPtr]::new($hwnd)
  [WinFg]::WithTargetInput($top, $action)
}

function Save-ClipboardText() {
  $saved = $null
  try { $saved = [System.Windows.Forms.Clipboard]::GetText() } catch {}
  if ([string]::IsNullOrEmpty($saved)) {
    try { $saved = Get-Clipboard -Raw -ErrorAction SilentlyContinue } catch {}
  }
  return $saved
}

function Restore-ClipboardText([string]$saved) {
  if (-not [string]::IsNullOrEmpty($saved)) {
    try { [System.Windows.Forms.Clipboard]::SetText($saved) } catch { Set-Clipboard -Value $saved -ErrorAction SilentlyContinue }
  } else {
    try { [System.Windows.Forms.Clipboard]::Clear() } catch { Clear-Clipboard -ErrorAction SilentlyContinue }
  }
}

function Read-ClipboardCaptureText([int]$timeoutMs = 1200) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $clip = [System.Windows.Forms.Clipboard]::GetText()
      if (-not [string]::IsNullOrEmpty($clip)) { return $clip }
    } catch {}
    try {
      $clip = Get-Clipboard -Raw -ErrorAction SilentlyContinue
      if (-not [string]::IsNullOrEmpty($clip)) { return $clip }
    } catch {}
    Start-Sleep -Milliseconds 50
  }
  return $null
}

function Focus-TerminalInputForKeys($el, [long]$hwnd, $bounds = $null) {
  $top = [IntPtr]::new($hwnd)
  [WinFg]::FocusWindow($top)
  Start-Sleep -Milliseconds 100
  $paneEl = $null
  if ($null -ne $el) {
    $paneEl = Resolve-TerminalPaneElement $el
    try { $paneEl.SetFocus() } catch {}
    Start-Sleep -Milliseconds 60
  }
  $clickBounds = Get-NormalizedBounds $bounds
  if ($null -eq $clickBounds -and $null -ne $paneEl) {
    $clickBounds = Get-TerminalPaneBoundsFromElement $paneEl
  }
  if ($null -ne $clickBounds) {
    Click-TerminalPromptPoint $top $clickBounds
  } elseif ($null -ne $paneEl) {
    try {
      $rect = $paneEl.Current.BoundingRectangle
      $x = [int](($rect.Left + $rect.Right) / 2)
      $y = [int](($rect.Bottom - 24))
      if ($x -gt 0 -and $y -gt 0) {
        [WinFg]::WithTargetInput($top, { [WinFg]::Click($x, $y) })
        Start-Sleep -Milliseconds 80
      }
    } catch {}
  }
}

function Try-TerminalClipboardCapture([long]$hwnd, $el, [scriptblock]$selectAction, [scriptblock[]]$copyActions, $bounds = $null) {
  $saved = Save-ClipboardText
  try {
    try { [System.Windows.Forms.Clipboard]::Clear() } catch { Clear-Clipboard -ErrorAction SilentlyContinue }
    Focus-TerminalInputForKeys $el $hwnd $bounds
    Invoke-WithTargetKeys $hwnd $selectAction
    Start-Sleep -Milliseconds 100
    foreach ($copyAction in $copyActions) {
      Invoke-WithTargetKeys $hwnd $copyAction
      Start-Sleep -Milliseconds 80
      $clip = Read-ClipboardCaptureText 1200
      if (-not [string]::IsNullOrWhiteSpace($clip)) { return $clip }
      try { [System.Windows.Forms.Clipboard]::Clear() } catch { Clear-Clipboard -ErrorAction SilentlyContinue }
    }
    return $null
  } finally {
    Restore-ClipboardText $saved
  }
}

function Invoke-TerminalPromptLineCopy([long]$hwnd, $el, [bool]$useConhostCopy, [bool]$useIntegratedCopy, $bounds = $null) {
  $selectCtrlA = { [WinFg]::SendCtrlCombo(0x41) }
  $selectHomeEnd = {
    [WinFg]::SendKey(0x24)
    Start-Sleep -Milliseconds 40
    [WinFg]::SendShiftCombo(0x23)
  }
  $copyCtrlShiftC = { [WinFg]::SendCtrlShiftCombo(0x43) }
  $copyCtrlC = { [WinFg]::SendCtrlCombo(0x43) }

  if ($useConhostCopy) {
    $clip = Try-TerminalClipboardCapture $hwnd $el $selectHomeEnd @($copyCtrlC) $bounds
    if ($clip) { return $clip }
    return Try-TerminalClipboardCapture $hwnd $el $selectCtrlA @($copyCtrlC) $bounds
  }
  if ($useIntegratedCopy) {
    $clip = Try-TerminalClipboardCapture $hwnd $el $selectCtrlA @($copyCtrlC, $copyCtrlShiftC) $bounds
    if ($clip) { return $clip }
    return Try-TerminalClipboardCapture $hwnd $el $selectHomeEnd @($copyCtrlC, $copyCtrlShiftC) $bounds
  }
  $clip = Try-TerminalClipboardCapture $hwnd $el $selectCtrlA @($copyCtrlShiftC, $copyCtrlC) $bounds
  if ($clip) { return $clip }
  return Try-TerminalClipboardCapture $hwnd $el $selectHomeEnd @($copyCtrlShiftC, $copyCtrlC) $bounds
}

function Invoke-TerminalSelectionCopy([long]$hwnd, $el, [bool]$useConhostCopy, [bool]$useIntegratedCopy, $bounds = $null) {
  $copyCtrlShiftC = { [WinFg]::SendCtrlShiftCombo(0x43) }
  $copyCtrlC = { [WinFg]::SendCtrlCombo(0x43) }
  if ($useConhostCopy -or $useIntegratedCopy) {
    return Try-TerminalClipboardCapture $hwnd $el { } @($copyCtrlC, $copyCtrlShiftC) $bounds
  }
  return Try-TerminalClipboardCapture $hwnd $el { } @($copyCtrlShiftC, $copyCtrlC) $bounds
}
