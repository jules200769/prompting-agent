param(
  [Parameter(Mandatory = $true)]
  [long]$WindowHandle,
  [Parameter(Mandatory = $true)]
  [string]$TextPath,
  [string]$MetaPath = ""
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\uia-write-meta.ps1"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WinInject {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);

  public const uint KEYEVENTF_KEYUP = 0x0002;
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
    StartSleep(30);
    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, IntPtr.Zero);
    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, IntPtr.Zero);
  }

  private static void StartSleep(int ms) {
    System.Threading.Thread.Sleep(ms);
  }

  public static void SendCtrlCombo(byte keyVk) {
    keybd_event(0x11, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    keybd_event(0x11, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
  }

  public static void SendKey(byte keyVk) {
    keybd_event(keyVk, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
  }
}
'@ -ErrorAction SilentlyContinue

$text = Get-Content -LiteralPath $TextPath -Raw -Encoding UTF8
$top = [IntPtr]::new($WindowHandle)
$meta = $null
if (-not [string]::IsNullOrEmpty($MetaPath) -and (Test-Path -LiteralPath $MetaPath)) {
  $meta = Get-Content -LiteralPath $MetaPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-ElementTextValue($el) {
  if ($null -eq $el) { return $null }
  try {
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp) { return $vp.Current.Value }
  } catch {}
  try {
    $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    if ($tp) { return $tp.DocumentRange.GetText(1000000) }
  } catch {}
  return $null
}

function Test-TextMatch([string]$read, [string]$expected) {
  if ($null -eq $read) { return $false }
  $r = $read.TrimEnd()
  $e = $expected.TrimEnd()
  if ($r -eq $e) { return $true }
  if ($e.Length -ge 8 -and $r.StartsWith($e.Substring(0, [Math]::Min(40, $e.Length)))) { return $true }
  return $false
}

function Clear-TextSelection([IntPtr]$top) {
  Start-Sleep -Milliseconds 40
  [WinInject]::WithTargetInput($top, { [WinInject]::SendKey(0x23) }) # End — cursor naar einde, deselect
}

function Complete-Inject([string]$method, [IntPtr]$top) {
  Clear-TextSelection $top
  Write-Output "PF_INJECT_OK=$method"
  exit 0
}

function Wait-TextMatch($el, [string]$expected) {
  for ($i = 0; $i -lt 6; $i++) {
    if (Test-TextMatch (Get-ElementTextValue $el) $expected) { return $true }
    Start-Sleep -Milliseconds 100
  }
  return $false
}

function Find-ElementByRuntimeId($root, [int[]]$targetId, [int]$maxNodes) {
  if ($null -eq $root -or $null -eq $targetId -or $targetId.Length -eq 0) { return $null }
  $target = $targetId -join ","
  $queue = New-Object System.Collections.Generic.Queue[Object]
  $queue.Enqueue($root)
  $seen = 0
  while ($queue.Count -gt 0 -and $seen -lt $maxNodes) {
    $el = $queue.Dequeue()
    $seen++
    try {
      $rid = $el.GetRuntimeId()
      if ($null -ne $rid -and (($rid -join ",") -eq $target)) { return $el }
      $children = $el.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
      foreach ($child in $children) { $queue.Enqueue($child) }
    } catch {}
  }
  return $null
}

function Click-Bounds($bounds) {
  if ($null -eq $bounds) { return }
  $x = [int](($bounds.left + $bounds.right) / 2)
  $y = [int](($bounds.top + $bounds.bottom) / 2)
  if ($x -gt 0 -and $y -gt 0) {
    [WinInject]::Click($x, $y)
    Start-Sleep -Milliseconds 200
  }
}

function Resolve-TargetElement($meta, [IntPtr]$top) {
  $el = $null
  if ($null -ne $meta -and $meta.runtimeId) {
    $rid = @($meta.runtimeId | ForEach-Object { [int]$_ })
    $el = Find-ElementByRuntimeId ([System.Windows.Automation.AutomationElement]::RootElement) $rid 20000
    if ($null -eq $el) {
      $el = Find-ElementByRuntimeId ([System.Windows.Automation.AutomationElement]::FromHandle($top)) $rid 5000
    }
  }
  if ($null -ne $el) {
    Click-Bounds $meta.bounds
    return $el
  }
  if ($null -ne $meta -and $meta.bounds) {
    Click-Bounds $meta.bounds
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -ne $el) { return $el }
  }
  return [System.Windows.Automation.AutomationElement]::FocusedElement
}

function Invoke-KeyboardReplace([IntPtr]$top, [string]$value) {
  Set-Clipboard -Value $value
  Start-Sleep -Milliseconds 80
  [WinInject]::WithTargetInput($top, {
    [WinInject]::SendCtrlCombo(0x41) # A
    Start-Sleep -Milliseconds 80
    [WinInject]::SendCtrlCombo(0x56) # V
  })
  Start-Sleep -Milliseconds 150
}

function Try-ValuePatternSet($el, [string]$value, [IntPtr]$top) {
  try {
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp -and $vp.Current.IsReadOnly -eq $false) {
      $vp.SetValue($value)
      if (Wait-TextMatch $el $value) {
        Complete-Inject "valuePattern" $top
      }
      # SetValue ran; avoid keyboard fallback that re-selects with Ctrl+A
      Complete-Inject "valuePattern" $top
    }
  } catch {}
  return $false
}

function Try-TextPatternPaste($el, [string]$value, [IntPtr]$top) {
  try {
    $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    if ($null -eq $tp) { return $false }
    $tp.DocumentRange.Select()
    Start-Sleep -Milliseconds 80
    Set-Clipboard -Value $value
    Start-Sleep -Milliseconds 80
    [WinInject]::WithTargetInput($top, { [WinInject]::SendCtrlCombo(0x56) })
    Start-Sleep -Milliseconds 150
    if (Wait-TextMatch $el $value) {
      Complete-Inject "textPatternPaste" $top
    }
    # Paste was sent after select; do not chain to Ctrl+A fallback
    Complete-Inject "textPatternPaste" $top
  } catch {}
  return $false
}

function Try-KeyboardReplace($el, [string]$value, [IntPtr]$top, $bounds) {
  if ($null -ne $el) {
    try {
      $rect = $el.Current.BoundingRectangle
      $x = [int](($rect.Left + $rect.Right) / 2)
      $y = [int](($rect.Top + $rect.Bottom) / 2)
      if ($x -gt 0 -and $y -gt 0) {
        [WinInject]::Click($x, $y)
        Start-Sleep -Milliseconds 150
      }
    } catch {}
  } elseif ($null -ne $bounds) {
    Click-Bounds $bounds
  }
  Invoke-KeyboardReplace $top $value
  $checkEl = $el
  if ($null -eq $checkEl) { $checkEl = [System.Windows.Automation.AutomationElement]::FocusedElement }
  if (Wait-TextMatch $checkEl $value) {
    Complete-Inject "keyboard" $top
  }
  return $false
}

[WinInject]::FocusWindow($top)
Start-Sleep -Milliseconds 300

$targetEl = Resolve-TargetElement $meta $top
$className = if ($null -ne $targetEl) { $targetEl.Current.ClassName } else { "(none)" }
Write-Output "PF_INJECT_TARGET=$className"

if ($null -ne $targetEl) {
  [void](Try-ValuePatternSet $targetEl $text $top)
  [void](Try-TextPatternPaste $targetEl $text $top)
}

# Reached only when ValuePattern/TextPattern were unavailable (not when paste/set already ran)
[void](Try-KeyboardReplace $targetEl $text $top $meta.bounds)

Write-Output "PF_INJECT_FAIL=all_methods"
exit 1
