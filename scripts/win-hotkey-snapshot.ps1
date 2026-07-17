param(
  [Parameter(Mandatory = $true)]
  [string]$MetaPath,
  [string]$TextPath = "",
  [long]$TargetHwnd = 0,
  [string]$ContextPath = ""
)

$ErrorActionPreference = "Stop"
# AGENTS: terminal-io.ps1 OWNS the shared `WinFg` C# class (full superset). Dot-sourcing it here
# means the local WinFg Add-Type below MUST stay behind its `if (-not [PSTypeName]'WinFg'.Type)`
# guard. Do not remove the guard and do not add a second unguarded `Add-Type ... class WinFg`,
# or the snapshot dies with TYPE_ALREADY_EXISTS → slow win-capture.ps1 fallback (laggy popup).
. "$PSScriptRoot\terminal-io.ps1"
. "$PSScriptRoot\uia-write-meta.ps1"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

# WinFg is already defined by terminal-io.ps1 (dot-sourced above). Guard against re-adding it —
# a duplicate Add-Type throws TYPE_ALREADY_EXISTS under $ErrorActionPreference='Stop', which
# crashed the snapshot and forced the slow win-capture.ps1 fallback (popup felt slow/reopened).
if (-not ([System.Management.Automation.PSTypeName]'WinFg').Type) {
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WinFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public static void FocusWindow(IntPtr hWnd) {
    IntPtr fg = GetForegroundWindow();
    uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);
    uint targetThread = GetWindowThreadProcessId(hWnd, IntPtr.Zero);
    if (fgThread != targetThread) AttachThreadInput(fgThread, targetThread, true);
    if (IsIconic(hWnd)) ShowWindow(hWnd, 9);
    SetForegroundWindow(hWnd);
    if (fgThread != targetThread) AttachThreadInput(fgThread, targetThread, false);
  }
  public static void WithTargetInput(IntPtr topLevel, Action action) {
    IntPtr fg = GetForegroundWindow();
    uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);
    uint targetThread = GetWindowThreadProcessId(topLevel, IntPtr.Zero);
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
}
'@ -ErrorAction SilentlyContinue
}

# AGENTS: PfCtx is the context-layer P/Invoke class — do NOT fold these into the shared
# WinFg class (owned by terminal-io.ps1). Guarded like every other Add-Type in this script.
if (-not ([System.Management.Automation.PSTypeName]'PfCtx').Type) {
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PfCtx {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
}
'@ -ErrorAction SilentlyContinue
}

function Get-WindowTitle([long]$hwnd) {
  try {
    $sb = New-Object System.Text.StringBuilder 512
    [void][PfCtx]::GetWindowText([IntPtr]::new($hwnd), $sb, $sb.Capacity)
    return $sb.ToString()
  } catch { return "" }
}

# Selection structure sidecar: selected text plus before/after-cursor context from the
# TextPattern already fetched for capture. Caret-only fields work via the same clone
# trick (empty selection range still marks the caret position). Whole body in one
# try/catch — a failure here must never break capture.
function Write-ContextSidecar($el, [string]$path) {
  if ([string]::IsNullOrEmpty($path) -or $null -eq $el) { return }
  try {
    $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    if ($null -eq $tp) { return }
    $ranges = $tp.GetSelection()
    if ($null -eq $ranges -or $ranges.Length -eq 0) { return }
    $sel = $ranges[0]
    $selectedText = $sel.GetText(4000)
    if ($null -eq $selectedText) { $selectedText = "" }
    $hasSelection = $selectedText.Length -gt 0

    $docRange = $tp.DocumentRange
    $before = $docRange.Clone()
    $before.MoveEndpointByRange([System.Windows.Automation.Text.TextPatternRangeEndpoint]::End, $sel, [System.Windows.Automation.Text.TextPatternRangeEndpoint]::Start)
    $beforeText = $before.GetText(-1)
    if ($null -eq $beforeText) { $beforeText = "" }
    $after = $docRange.Clone()
    $after.MoveEndpointByRange([System.Windows.Automation.Text.TextPatternRangeEndpoint]::Start, $sel, [System.Windows.Automation.Text.TextPatternRangeEndpoint]::End)
    $afterText = $after.GetText(-1)
    if ($null -eq $afterText) { $afterText = "" }

    if ($selectedText.Length -gt 4000) { $selectedText = $selectedText.Substring(0, 4000) }
    if ($beforeText.Length -gt 1500) { $beforeText = $beforeText.Substring($beforeText.Length - 1500) }
    if ($afterText.Length -gt 500) { $afterText = $afterText.Substring(0, 500) }

    $obj = [ordered]@{
      hasSelection = $hasSelection
      selectedText = $selectedText
      beforeCursor = $beforeText
      afterCursor  = $afterText
    }
    $json = $obj | ConvertTo-Json -Compress
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($path, $json, $enc)
  } catch {}
}

function Get-WindowInfo([long]$hwnd) {
  $className = ""
  $processName = ""
  try {
    $sb = New-Object System.Text.StringBuilder 256
    [void][WinFg]::GetClassName([IntPtr]::new($hwnd), $sb, $sb.Capacity)
    $className = $sb.ToString()
  } catch {}
  try {
    $winPid = [uint32]0
    [void][WinFg]::GetWindowThreadProcessId([IntPtr]::new($hwnd), [ref]$winPid)
    if ($winPid -gt 0) {
      $processName = (Get-Process -Id $winPid -ErrorAction SilentlyContinue).ProcessName
    }
  } catch {}
  return @{
    Hwnd        = $hwnd
    ClassName   = $className
    ProcessName = $processName
  }
}

function Get-ForegroundWindowInfo {
  $hwnd = [WinFg]::GetForegroundWindow()
  $className = ""
  $processName = ""
  try {
    $sb = New-Object System.Text.StringBuilder 256
    [void][WinFg]::GetClassName($hwnd, $sb, $sb.Capacity)
    $className = $sb.ToString()
  } catch {}
  try {
    $winPid = [uint32]0
    [void][WinFg]::GetWindowThreadProcessId($hwnd, [ref]$winPid)
    if ($winPid -gt 0) {
      $processName = (Get-Process -Id $winPid -ErrorAction SilentlyContinue).ProcessName
    }
  } catch {}
  return @{
    Hwnd        = $hwnd.ToInt64()
    ClassName   = $className
    ProcessName = $processName
  }
}

function Test-IsIntegratedTerminalHost([string]$processName) {
  $proc = if ($processName) { $processName } else { "" }
  $proc = $proc.ToLowerInvariant() -replace '\.exe$', ''
  return $proc -in @('cursor', 'code', 'code - insiders')
}

function Test-IsTerminalWindow([string]$className, [string]$processName) {
  $terminalClasses = @(
    "CASCADIA_HOSTING_WINDOW_CLASS",
    "ConsoleWindowClass",
    "mintty"
  )
  if ($className -and ($terminalClasses -contains $className)) { return $true }
  $proc = if ($processName) { $processName } else { "" }
  $proc = $proc.ToLowerInvariant() -replace '\.exe$', ''
  $terminalProcesses = @(
    "windowsterminal", "conhost", "cmd", "powershell", "pwsh", "mintty", "wsl", "bash"
  )
  if ($proc -and ($terminalProcesses -contains $proc)) { return $true }
  return $false
}

function Test-IsTerminalAccessibilityNoise([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return $false }
  if ($text -match '(?i)Toggle Screen Reader Accessibility Mode') { return $true }
  if ($text -match '(?i)Alt\+F1 for terminal accessibility help') { return $true }
  if ($text -match '(?i)Run the command:') { return $true }
  if ($text -match '(?i)Terminal \d+,?\s*(powershell|pwsh|cmd|bash|zsh|wsl|sh)\b') { return $true }
  return $false
}

function Test-IsIdeWindowTitleNoise([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return $false }
  if ($text -match '(?i)\s-\s.+?\s-\s(Cursor|Visual Studio Code)\s*$') { return $true }
  if ($text -match '(?i)\s-\s.+\s-\sCode\s*$') { return $true }
  if ($text -match '(?i)\s-\sCursor\s*$') { return $true }
  return $false
}

function Test-IsCaptureNoise([string]$text) {
  return (Test-IsTerminalAccessibilityNoise $text) -or (Test-IsIdeWindowTitleNoise $text)
}

function Test-IsTerminalBufferDump([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return $false }
  if ($text -match '(?i)Copyright \(C\) Microsoft Corporation') { return $true }
  if ($text -match '(?i)Install the latest PowerShell') { return $true }
  if ($text -match '(?i)^Windows PowerShell\s*$') { return $true }
  if ($text -match '(?i)https://aka\.ms/PSWindows') { return $true }
  return $false
}

function Test-FocusedElementIsConsolePane($el) {
  if ($null -eq $el) { return $false }
  try {
    $cls = $el.Current.ClassName
    if ($cls -match '(?i)Console') { return $true }
    $ct = $el.Current.ControlType.ProgrammaticName
    if ($ct -eq "ControlType.Document" -and $cls -match '(?i)Windows') { return $true }
  } catch {}
  return $false
}

function Test-FocusedElementIsTerminalPane($el) {
  if ($null -eq $el) { return $false }
  try {
    $name = $el.Current.Name
    if ($name -match '(?i)^Terminal \d+') { return $true }
    $aid = $el.Current.AutomationId
    if ($aid -match '(?i)terminal') { return $true }
    $cls = $el.Current.ClassName
    if ($cls -match '(?i)terminal|xterm') { return $true }
    $ct = $el.Current.ControlType.ProgrammaticName
    if ($ct -eq "ControlType.Pane" -and $name -match '(?i)(powershell|pwsh|cmd|bash|zsh|wsl|git bash)') { return $true }
  } catch {}
  return $false
}

function Test-ElementHasTerminalAncestor($el) {
  if ($null -eq $el) { return $false }
  $cur = $el
  for ($i = 0; $i -lt 12 -and $null -ne $cur; $i++) {
    if ((Test-FocusedElementIsTerminalPane $cur) -or (Test-FocusedElementIsConsolePane $cur)) {
      return $true
    }
    try { $cur = $cur.GetParent() } catch { break }
  }
  return $false
}

function Resolve-FocusedIsTerminalPane($el, [string]$processName) {
  if ($null -eq $el) { return $false }
  if ((Test-FocusedElementIsTerminalPane $el) -or (Test-FocusedElementIsConsolePane $el)) { return $true }
  if ((Test-IsIntegratedTerminalHost $processName) -and (Test-ElementHasTerminalAncestor $el)) { return $true }
  return $false
}

function Get-ElementText($el) {
  if ($null -eq $el) { return $null }
  $text = $null
  try {
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp) { $text = $vp.Current.Value }
  } catch {}
  if ([string]::IsNullOrEmpty($text)) {
    try {
      $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
      if ($tp) { $text = $tp.DocumentRange.GetText(1000000) }
    } catch {}
  }
  if ([string]::IsNullOrEmpty($text)) { return $null }
  if (Test-IsCaptureNoise $text) { return $null }
  return $text
}

function Test-IsUsableCaptureText([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return $false }
  if (Test-IsCaptureNoise $text) { return $false }
  # Buffer dumps are normalized in TypeScript — keep scrollback context.
  return $true
}

function Write-CaptureTextPath([string]$text, [string]$path) {
  if (-not (Test-IsUsableCaptureText $text)) { return $false }
  if ([string]::IsNullOrEmpty($path)) { return $true }
  $enc = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($path, $text, $enc)
  return $true
}

function Get-ElementSelectionText($el) {
  if ($null -eq $el) { return $null }
  try {
    $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    if ($null -eq $tp) { return $null }
    $ranges = $tp.GetSelection()
    if ($null -eq $ranges -or $ranges.Length -eq 0) { return $null }
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($range in $ranges) {
      $chunk = $range.GetText(-1)
      if (-not [string]::IsNullOrEmpty($chunk)) {
        [void]$parts.Add($chunk)
      }
    }
    if ($parts.Count -eq 0) { return $null }
    $joined = ($parts -join "")
    if (-not (Test-IsUsableCaptureText $joined)) { return $null }
    return $joined
  } catch {}
  return $null
}

function Get-ElementDocumentText($el) {
  if ($null -eq $el) { return $null }
  try {
    $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    if ($null -eq $tp) { return $null }
    $text = $tp.DocumentRange.GetText(1000000)
    if ([string]::IsNullOrEmpty($text)) { return $null }
    if (Test-IsCaptureNoise $text) { return $null }
    return $text
  } catch {}
  return $null
}

function Test-IsTerminalPaneCandidate($el) {
  if ($null -eq $el) { return $false }
  if ((Test-FocusedElementIsTerminalPane $el) -or (Test-FocusedElementIsConsolePane $el)) { return $true }
  if (Test-TerminalPaneElement $el) { return $true }
  return $false
}

function Find-TerminalPaneInSubtree($el, [int]$depth, [int]$maxDepth) {
  if ($null -eq $el -or $depth -gt $maxDepth) { return $null }
  if (Test-IsTerminalPaneCandidate $el) { return $el }
  try {
    $children = $el.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($child in $children) {
      $found = Find-TerminalPaneInSubtree $child ($depth + 1) $maxDepth
      if ($null -ne $found) { return $found }
    }
  } catch {}
  return $null
}

function Find-TerminalPaneInWindow([long]$hwnd) {
  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]::new($hwnd))
    if ($null -eq $root) { return $null }
    return Find-TerminalPaneInSubtree $root 0 14
  } catch {}
  return $null
}

function Test-IsTextControl($el) {
  if ($null -eq $el) { return $false }
  if ((Test-FocusedElementIsTerminalPane $el) -or (Test-ElementHasTerminalAncestor $el)) { return $false }
  try {
    $ct = $el.Current.ControlType.ProgrammaticName
    if ($ct -eq "ControlType.Edit" -or $ct -eq "ControlType.Document") { return $true }
    $cls = $el.Current.ClassName
    if ($cls -match "editor|input|textarea|Omnibox|RichEdit|aislash|monaco|ProseMirror|contenteditable") { return $true }
    if ($el.Current.IsKeyboardFocusable) {
      try {
        $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if ($vp) { return $true }
      } catch {}
      try {
        $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
        if ($tp) { return $true }
      } catch {}
    }
  } catch {}
  return $false
}

$fg = if ($TargetHwnd -gt 0) { Get-WindowInfo $TargetHwnd } else { Get-ForegroundWindowInfo }
$hwnd = $fg.Hwnd
$className = $fg.ClassName
$processName = $fg.ProcessName
$isIntegratedHost = Test-IsIntegratedTerminalHost $processName
$isNativeTerminal = Test-IsTerminalWindow $className $processName
$uiaStatus = "miss"
$charCount = 0
$lastEl = $null
$hasSelection = $false
$focusedIsTerminalPane = $false
$isTerminal = $false

if ($TargetHwnd -gt 0) {
  [WinFg]::FocusWindow([IntPtr]::new($TargetHwnd))
  Start-Sleep -Milliseconds 80
}

try {
  $focusedEl = [System.Windows.Automation.AutomationElement]::FocusedElement
  $focusedIsTerminalPane = Resolve-FocusedIsTerminalPane $focusedEl $processName
} catch {}

# Password fields are NEVER read — no text, no UIA meta, no context sidecar. Not gated
# by any setting. Emit a minimal summary so the main process can blank its pending state.
$isPassword = $false
try { $isPassword = [bool]$focusedEl.Current.IsPassword } catch {}
if ($isPassword) {
  $result = @{
    hwnd                  = $hwnd
    className             = $className
    process               = $processName
    hostKind              = "native"
    isTerminal            = $false
    focusedIsTerminalPane = $false
    hasSelection          = $false
    uia                   = "miss"
    chars                 = 0
    isPassword            = $true
  }
  Write-Output ($result | ConvertTo-Json -Compress)
  exit 1
}

$windowTitle = Get-WindowTitle $hwnd

if ($isIntegratedHost -and -not $focusedIsTerminalPane) {
  $skipPaneTree = $false
  try {
    $checkEl = [System.Windows.Automation.AutomationElement]::FocusedElement
    if (Test-IsTextControl $checkEl) { $skipPaneTree = $true }
  } catch {}
  if (-not $skipPaneTree) {
    $paneEl = Find-TerminalPaneInWindow $hwnd
    if ($null -ne $paneEl) {
      $focusedIsTerminalPane = $true
      $lastEl = $paneEl
    }
  }
}

$isTerminal = $isNativeTerminal -or ($isIntegratedHost -and $focusedIsTerminalPane)

if ($isTerminal) {
  for ($i = 0; $i -lt 3; $i++) {
    try {
      $el = $lastEl
      if ($null -eq $el) {
        try { $el = [System.Windows.Automation.AutomationElement]::FocusedElement } catch {}
      }
      if ($null -ne $el) { $lastEl = $el }
      $termBounds = $null
      if ($null -ne $el) {
        $termBounds = Get-TerminalPaneBoundsFromElement $el
      }
      if ($null -eq $termBounds) {
        $paneEl = Find-TerminalPaneInWindow $hwnd
        if ($null -ne $paneEl) {
          $lastEl = $paneEl
          $el = $paneEl
          $termBounds = Get-TerminalPaneBoundsFromElement $paneEl
        }
      }
      # UIA-only — never SendCtrlCombo/Ctrl+C here. Clipboard copy fallbacks inject ^C into
      # the focused terminal (breaks npm run dev / shells) and were rejected for selection UX.
      $text = $null
      if ($null -ne $el) {
        $text = Get-ElementSelectionText $el
      }
      if ([string]::IsNullOrEmpty($text) -and $null -ne $el) {
        $text = Get-ElementDocumentText $el
      }
      if (Test-IsUsableCaptureText $text) {
        if (Write-CaptureTextPath $text $TextPath) {
          $uiaStatus = "ok"
          $charCount = $text.Length
          $hasSelection = $true
          break
        }
      }
    } catch {}
    if ($i -lt 2) { Start-Sleep -Milliseconds 50 }
  }
} else {
  if ($uiaStatus -ne "ok") {
    for ($i = 0; $i -lt 3; $i++) {
      try {
        $el = [System.Windows.Automation.AutomationElement]::FocusedElement
        if (Test-IsTextControl $el) {
          $lastEl = $el
          $text = Get-ElementText $el
          # Native terminal only — never flip isTerminal from dump markers on a text control
          # (composer/monaco/etc. can contain multi-line drafts or pasted PS banners).
          if (-not [string]::IsNullOrEmpty($text) -and $isNativeTerminal) {
            if (Write-CaptureTextPath $text $TextPath) {
              $isTerminal = $true
              $uiaStatus = "ok"
              $charCount = $text.Length
              $hasSelection = $true
              break
            }
          }
          if (-not [string]::IsNullOrEmpty($text) -and (Test-IsCaptureNoise $text)) {
            $text = $null
          }
          if (-not [string]::IsNullOrEmpty($text)) {
            Write-ElementMeta $el "preCaptureFocus" $MetaPath $className $processName
            Write-ContextSidecar $el $ContextPath
            if (Write-CaptureTextPath $text $TextPath) {
              $uiaStatus = "ok"
              $charCount = $text.Length
              break
            }
          }
        }
      } catch {}
      if ($i -lt 2) { Start-Sleep -Milliseconds 50 }
    }
  }

}

$terminalBounds = $null
if ($isTerminal) {
  $boundsEl = $lastEl
  if ($null -eq $boundsEl) {
    $boundsEl = Find-TerminalPaneInWindow $hwnd
  }
  if ($null -eq $boundsEl) {
    try { $boundsEl = [System.Windows.Automation.AutomationElement]::FocusedElement } catch {}
  }
  $terminalBounds = Get-TerminalPaneBoundsFromElement $boundsEl
}

$hostKind = "native"
if ($isTerminal) {
  $hostKind = "terminal"
} elseif (-not $isTerminal) {
  $hostKind = Get-HostKind $className "" ""
}

# Best-effort page URL for Chromium browsers (Document element exposes it via ValuePattern).
# Single bounded attempt; window-title parsing is the fallback for site routing.
$siteUrl = $null
if ($ContextPath -and -not $isTerminal -and $className -match 'Chrome_WidgetWin') {
  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]::new($hwnd))
    if ($null -ne $root) {
      $docCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Document)
      $doc = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $docCond)
      if ($null -ne $doc) {
        $vp = $doc.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if ($vp -and $vp.Current.Value) { $siteUrl = $vp.Current.Value }
      }
    }
  } catch {}
}

$result = @{
  hwnd                  = $hwnd
  className             = $className
  process               = $processName
  hostKind              = $hostKind
  isTerminal            = $isTerminal
  focusedIsTerminalPane = $focusedIsTerminalPane
  hasSelection          = $hasSelection
  uia                   = $uiaStatus
  chars                 = $charCount
  windowTitle           = $windowTitle
  isPassword            = $false
}
if ($null -ne $terminalBounds) {
  $result.terminalBounds = $terminalBounds
}
if (-not [string]::IsNullOrEmpty($siteUrl)) {
  $result.siteUrl = $siteUrl
}
Write-Output ($result | ConvertTo-Json -Compress)
if ($uiaStatus -eq "ok" -and $charCount -gt 0) { exit 0 }
exit 1
