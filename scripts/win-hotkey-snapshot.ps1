param(
  [Parameter(Mandatory = $true)]
  [string]$MetaPath,
  [string]$TextPath = ""
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\uia-write-meta.ps1"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

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
  public static void FocusWindow(IntPtr hWnd) {
    IntPtr fg = GetForegroundWindow();
    uint fgThread = GetWindowThreadProcessId(fg, out _);
    uint targetThread = GetWindowThreadProcessId(hWnd, out _);
    if (fgThread != targetThread) AttachThreadInput(fgThread, targetThread, true);
    if (IsIconic(hWnd)) ShowWindow(hWnd, 9);
    SetForegroundWindow(hWnd);
    if (fgThread != targetThread) AttachThreadInput(fgThread, targetThread, false);
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
  public static void SendCtrlCombo(byte keyVk) {
    const uint KEYUP = 0x0002;
    keybd_event(0x11, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, KEYUP, UIntPtr.Zero);
    keybd_event(0x11, 0, KEYUP, UIntPtr.Zero);
  }
}
'@ -ErrorAction SilentlyContinue

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
    $pid = [uint32]0
    [void][WinFg]::GetWindowThreadProcessId($hwnd, [ref]$pid)
    if ($pid -gt 0) {
      $processName = (Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName
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
  if ($text -match '(?i)^Terminal \d+,?\s*(powershell|pwsh|cmd|bash|zsh|wsl|sh)\b') { return $true }
  return $false
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
  if (Test-IsTerminalAccessibilityNoise $text) { return $null }
  return $text
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
    if (Test-IsTerminalAccessibilityNoise $joined) { return $null }
    if (Test-IsTerminalBufferDump $joined) { return $null }
    return $joined
  } catch {}
  return $null
}

function Wait-ClipboardText([int]$timeoutMs = 400, [int]$intervalMs = 50) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    $clip = Get-Clipboard -Raw -ErrorAction SilentlyContinue
    if (-not [string]::IsNullOrEmpty($clip)) { return $clip }
    Start-Sleep -Milliseconds $intervalMs
  }
  return $null
}

function Get-ElementDocumentText($el) {
  if ($null -eq $el) { return $null }
  try {
    $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    if ($null -eq $tp) { return $null }
    $text = $tp.DocumentRange.GetText(1000000)
    if ([string]::IsNullOrEmpty($text)) { return $null }
    if (Test-IsTerminalAccessibilityNoise $text) { return $null }
    return $text
  } catch {}
  return $null
}

function Invoke-TerminalSelectionCopy([long]$hwnd, [bool]$useConhostCopy) {
  $saved = Get-Clipboard -Raw -ErrorAction SilentlyContinue
  Clear-Clipboard -ErrorAction SilentlyContinue
  try {
    [WinFg]::FocusWindow([IntPtr]::new($hwnd))
    Start-Sleep -Milliseconds 80
    if ($useConhostCopy) {
      [WinFg]::SendCtrlCombo(0x43)
    } else {
      [WinFg]::SendCtrlShiftCombo(0x43)
    }
    $clip = Wait-ClipboardText 500 50
    if ([string]::IsNullOrEmpty($clip)) { return $null }
    if (Test-IsTerminalAccessibilityNoise $clip) { return $null }
    if (Test-IsTerminalBufferDump $clip) { return $null }
    return $clip
  } finally {
    if ($saved) { Set-Clipboard -Value $saved -ErrorAction SilentlyContinue }
    else { Clear-Clipboard -ErrorAction SilentlyContinue }
  }
}

function Test-IsTextControl($el) {
  if ($null -eq $el) { return $false }
  if (Test-FocusedElementIsTerminalPane $el) { return $false }
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

$fg = Get-ForegroundWindowInfo
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

try {
  $focusedEl = [System.Windows.Automation.AutomationElement]::FocusedElement
  $focusedIsTerminalPane = (Test-FocusedElementIsTerminalPane $focusedEl) -or (Test-FocusedElementIsConsolePane $focusedEl)
} catch {}

$isTerminal = $isNativeTerminal -or ($isIntegratedHost -and $focusedIsTerminalPane)
$useConhostCopy = $className -eq "ConsoleWindowClass"

if ($isTerminal) {
  for ($i = 0; $i -lt 3; $i++) {
    try {
      $el = [System.Windows.Automation.AutomationElement]::FocusedElement
      if ($null -ne $el) {
        $lastEl = $el
        $text = Get-ElementSelectionText $el
        if ([string]::IsNullOrEmpty($text)) {
          $text = Invoke-TerminalSelectionCopy $hwnd $useConhostCopy
        }
        if ([string]::IsNullOrEmpty($text)) {
          $text = Get-ElementDocumentText $el
        }
        if (-not [string]::IsNullOrEmpty($text)) {
          if (-not [string]::IsNullOrEmpty($TextPath)) {
            $enc = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($TextPath, $text, $enc)
          }
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
  for ($i = 0; $i -lt 3; $i++) {
    try {
      $el = [System.Windows.Automation.AutomationElement]::FocusedElement
      if (Test-IsTextControl $el) {
        $lastEl = $el
        $text = Get-ElementText $el
        if (-not [string]::IsNullOrEmpty($text) -and (Test-IsTerminalBufferDump $text -or $isNativeTerminal)) {
          if (-not [string]::IsNullOrEmpty($TextPath)) {
            $enc = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($TextPath, $text, $enc)
          }
          $isTerminal = $true
          $uiaStatus = "ok"
          $charCount = $text.Length
          $hasSelection = $true
          break
        }
        if (-not [string]::IsNullOrEmpty($text)) {
          Write-ElementMeta $el "preCaptureFocus" $MetaPath
          if (-not [string]::IsNullOrEmpty($TextPath)) {
            $enc = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($TextPath, $text, $enc)
          }
          $uiaStatus = "ok"
          $charCount = $text.Length
          break
        }
      }
    } catch {}
    if ($i -lt 2) { Start-Sleep -Milliseconds 50 }
  }

  if ($uiaStatus -ne "ok" -and $null -ne $lastEl) {
    Write-ElementMeta $lastEl "preCaptureFocus" $MetaPath
    $uiaStatus = "ok"
  }
}

$result = @{
  hwnd                  = $hwnd
  className             = $className
  process               = $processName
  isTerminal            = $isTerminal
  focusedIsTerminalPane = $focusedIsTerminalPane
  hasSelection          = $hasSelection
  uia                   = $uiaStatus
  chars                 = $charCount
}
Write-Output ($result | ConvertTo-Json -Compress)
if ($uiaStatus -eq "ok") { exit 0 }
exit 1
