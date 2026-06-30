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
  [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);

  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const uint KEYEVENTF_UNICODE = 0x0004;
  public const uint INPUT_KEYBOARD = 1;
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;

  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public uint type;
    public KEYBDINPUT ki;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

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

  public static void SendUnicodeChar(char ch) {
    INPUT down = new INPUT();
    down.type = INPUT_KEYBOARD;
    down.ki = new KEYBDINPUT { wVk = 0, wScan = ch, dwFlags = KEYEVENTF_UNICODE };
    INPUT up = new INPUT();
    up.type = INPUT_KEYBOARD;
    up.ki = new KEYBDINPUT { wVk = 0, wScan = ch, dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP };
    INPUT[] inputs = new INPUT[] { down, up };
    SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
  }

  public static void SendUnicodeText(string text) {
    var e = System.Globalization.StringInfo.GetTextElementEnumerator(text);
    while (e.MoveNext()) {
      string elem = e.GetTextElement();
      if (elem == "\r\n" || elem == "\n" || elem == "\r") {
        SendKey(0x0D);
        continue;
      }
      foreach (char c in elem) {
        SendUnicodeChar(c);
      }
    }
  }
}
'@ -ErrorAction SilentlyContinue

$text = Get-Content -LiteralPath $TextPath -Raw -Encoding UTF8
$top = [IntPtr]::new($WindowHandle)
$meta = $null
if (-not [string]::IsNullOrEmpty($MetaPath) -and (Test-Path -LiteralPath $MetaPath)) {
  $meta = Get-Content -LiteralPath $MetaPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

# Chrome/Edge/Brave and all Electron apps (Cursor, ChatGPT desktop) share the
# "Chrome_WidgetWin" top-level class. Chromium web fields ignore UIA
# ValuePattern.SetValue, so treat them all as rich editors and use the single
# clipboard-paste path Cursor already uses — no ValuePattern/Unicode cascade.
$script:IsChromiumHost = $false
try {
  $topCls = [System.Windows.Automation.AutomationElement]::FromHandle($top).Current.ClassName
  if ($topCls -match "Chrome_WidgetWin") { $script:IsChromiumHost = $true }
} catch {}

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

function Test-TextMatch([string]$read, [string]$expected, $el) {
  if ($null -eq $read) { return $false }
  $r = $read.TrimEnd()
  $e = $expected.TrimEnd()
  if ($r -eq $e) { return $true }
  if ($e.Length -ge 8 -and $r.StartsWith($e.Substring(0, [Math]::Min(40, $e.Length)))) { return $true }
  if ($null -ne $el -and (Test-IsRichTextEditor $el)) {
    $rNorm = $r -replace "`r`n", "`n"
    $eNorm = $e -replace "`r`n", "`n"
    if ($rNorm -eq $eNorm) { return $true }
    if ($eNorm.Length -ge 12 -and $rNorm.Contains($eNorm.Substring(0, [Math]::Min(80, $eNorm.Length)))) { return $true }
  }
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
    if (Test-TextMatch (Get-ElementTextValue $el) $expected $el) { return $true }
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

function Test-IsRichTextEditor($el) {
  if ($script:IsChromiumHost) { return $true }
  if ($null -eq $el) { return $false }
  try {
    $cls = $el.Current.ClassName
    if ($cls -match "aislash|monaco|ProseMirror|contenteditable|CodeMirror|ace_editor|inputarea") { return $true }
    $ct = $el.Current.ControlType.ProgrammaticName
    if ($ct -eq "ControlType.Document") { return $true }
  } catch {}
  return $false
}

function Find-TextHostElement($el) {
  $cur = $el
  for ($i = 0; $i -lt 10 -and $null -ne $cur; $i++) {
    try {
      if (Test-IsRichTextEditor $cur) { return $cur }
      $tp = $cur.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
      if ($tp) { return $cur }
      $vp = $cur.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      if ($vp -and $vp.Current.IsReadOnly -eq $false) { return $cur }
    } catch {}
    try { $cur = $cur.GetParent() } catch { break }
    if ($null -eq $cur) { break }
  }
  return $el
}

function Resolve-ElementAtBounds($bounds) {
  if ($null -eq $bounds) { return $null }
  $x = [int](($bounds.left + $bounds.right) / 2)
  $y = [int](($bounds.top + $bounds.bottom) / 2)
  if ($x -le 0 -or $y -le 0) { return $null }
  try {
    $pt = New-Object System.Windows.Point $x, $y
    $el = [System.Windows.Automation.AutomationElement]::FromPoint($pt)
    if ($null -ne $el) { return Find-TextHostElement $el }
  } catch {}
  return $null
}

function Invoke-ElementFocus($el) {
  if ($null -eq $el) { return }
  try { $el.SetFocus() } catch {}
  Start-Sleep -Milliseconds 60
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
  if ($null -eq $el -and $null -ne $meta -and $meta.bounds) {
    $el = Resolve-ElementAtBounds $meta.bounds
  }
  if ($null -ne $el) {
    Click-Bounds $meta.bounds
    Invoke-ElementFocus $el
    return $el
  }
  if ($null -ne $meta -and $meta.bounds) {
    Click-Bounds $meta.bounds
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -ne $el) { return Find-TextHostElement $el }
  }
  $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
  if ($null -ne $focused) { return Find-TextHostElement $focused }
  return $focused
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
  if (Test-IsRichTextEditor $el) { return $false }
  try {
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp -and $vp.Current.IsReadOnly -eq $false) {
      $vp.SetValue($value)
      if (Wait-TextMatch $el $value) {
        Complete-Inject "valuePattern" $top
      }
    }
  } catch {}
  return $false
}

function Try-RichEditorPaste($el, [string]$value, [IntPtr]$top, $bounds) {
  if (-not (Test-IsRichTextEditor $el)) { return $false }
  Focus-TargetElement $el $bounds
  Invoke-ElementFocus $el
  Set-Clipboard -Value $value
  Start-Sleep -Milliseconds 80
  [WinInject]::WithTargetInput($top, {
    [WinInject]::SendCtrlCombo(0x41) # A — Monaco/Cursor respond better than UIA DocumentRange.Select
    Start-Sleep -Milliseconds 80
    [WinInject]::SendCtrlCombo(0x56) # V
  })
  Start-Sleep -Milliseconds 200
  if (Wait-TextMatch $el $value) {
    Complete-Inject "richEditorPaste" $top
  }
  return $false
}

function Try-TextPatternPaste($el, [string]$value, [IntPtr]$top, $bounds) {
  try {
    $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    if ($null -eq $tp) { return $false }
    Focus-TargetElement $el $bounds
    Invoke-ElementFocus $el
    if (Test-IsRichTextEditor $el) {
      [WinInject]::WithTargetInput($top, { [WinInject]::SendCtrlCombo(0x41) })
    } else {
      $tp.DocumentRange.Select()
    }
    Start-Sleep -Milliseconds 80
    Set-Clipboard -Value $value
    Start-Sleep -Milliseconds 80
    [WinInject]::WithTargetInput($top, { [WinInject]::SendCtrlCombo(0x56) })
    Start-Sleep -Milliseconds 150
    if (Wait-TextMatch $el $value) {
      Complete-Inject "textPatternPaste" $top
    }
  } catch {}
  return $false
}

function Focus-TargetElement($el, $bounds) {
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
}

function Try-UnicodeType($el, [string]$value, [IntPtr]$top, $bounds) {
  Focus-TargetElement $el $bounds
  [WinInject]::WithTargetInput($top, {
    [WinInject]::SendCtrlCombo(0x41) # A
    Start-Sleep -Milliseconds 80
    [WinInject]::SendUnicodeText($value)
  })
  Start-Sleep -Milliseconds 150
  $checkEl = $el
  if ($null -eq $checkEl) { $checkEl = [System.Windows.Automation.AutomationElement]::FocusedElement }
  if (Wait-TextMatch $checkEl $value) {
    Complete-Inject "unicode" $top
  }
  return $false
}

function Try-KeyboardReplace($el, [string]$value, [IntPtr]$top, $bounds) {
  Focus-TargetElement $el $bounds
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
  [void](Try-RichEditorPaste $targetEl $text $top $meta.bounds)
  [void](Try-ValuePatternSet $targetEl $text $top)
  [void](Try-TextPatternPaste $targetEl $text $top $meta.bounds)
}

# Unicode keystrokes before clipboard paste fallback
[void](Try-UnicodeType $targetEl $text $top $meta.bounds)

# Reached only when ValuePattern/TextPattern/Unicode were unavailable (not when paste/set already ran)
[void](Try-KeyboardReplace $targetEl $text $top $meta.bounds)

Write-Output "PF_INJECT_FAIL=all_methods"
exit 1
