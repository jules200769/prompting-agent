param(
  [Parameter(Mandatory = $true)]
  [long]$WindowHandle,
  [Parameter(Mandatory = $true)]
  [string]$TextPath,
  [string]$MetaPath = ""
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\bridge-compat.ps1"
. "$PSScriptRoot\terminal-io.ps1"
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
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const uint KEYEVENTF_UNICODE = 0x0004;
  public const uint INPUT_KEYBOARD = 1;
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint WM_GETOBJECT = 0x003D;
  public const int OBJID_CLIENT = unchecked((int)0xFFFFFFFC);

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
    System.Threading.Thread.Sleep(30);
    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, IntPtr.Zero);
    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, IntPtr.Zero);
  }

  public static void SendCtrlCombo(byte keyVk) {
    keybd_event(0x11, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    keybd_event(0x11, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
  }

  public static void SendCtrlShiftCombo(byte keyVk) {
    keybd_event(0x11, 0, 0, UIntPtr.Zero);
    keybd_event(0x10, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    keybd_event(0x10, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    keybd_event(0x11, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
  }

  public static void SendShiftCombo(byte keyVk) {
    keybd_event(0x10, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    keybd_event(0x10, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
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

  public static void ActivateChromiumAccessibility(IntPtr top) {
    IntPtr render = FindWindowEx(top, IntPtr.Zero, "Chrome_RenderWidgetHostHWND1", null);
    if (render != IntPtr.Zero) {
      SendMessage(render, WM_GETOBJECT, IntPtr.Zero, new IntPtr(OBJID_CLIENT));
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

$script:IsChromiumHost = $false
$topCls = ""
try {
  $topCls = [System.Windows.Automation.AutomationElement]::FromHandle($top).Current.ClassName
  if ($topCls -match "Chrome_WidgetWin") { $script:IsChromiumHost = $true }
} catch {}
if ($meta -and $meta.topClassName -match "Chrome_WidgetWin") {
  $script:IsChromiumHost = $true
  $topCls = $meta.topClassName
}

# Safety gate: if the frozen capture target is no longer a live window (source closed
# between capture and Apply), refuse to inject rather than falling back to whatever is
# focused — that would land refined text in the wrong window. Node then keeps the refined
# text on the clipboard. A live window (incl. non-foreground / Chromium) is never rejected.
if (-not [WinInject]::IsWindow($top)) {
  Write-Output "PF_INJECT_FAIL=deadTarget"
  Complete-AnvyllScript 1
  return
}

function Normalize-InjectText([string]$value) {
  if ($null -eq $value) { return "" }
  $norm = $value -replace "`r`n", "`n"
  $norm = $norm -replace "[\u200B-\u200D\uFEFF]", ""
  return $norm.TrimEnd()
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

function Test-TextMatch([string]$read, [string]$expected, $el) {
  if ($null -eq $read) { return $false }
  $r = Normalize-InjectText $read
  $e = Normalize-InjectText $expected
  if ($r -eq $e) { return "full" }
  if ($e.Length -gt 2048) {
    $prefixLen = [Math]::Min(200, $e.Length)
    $suffixLen = [Math]::Min(100, $e.Length)
    $prefix = $e.Substring(0, $prefixLen)
    $suffix = $e.Substring($e.Length - $suffixLen)
    if ($r.StartsWith($prefix) -and $r.EndsWith($suffix)) { return "partial" }
    if ($r.Contains($prefix) -and $r.Contains($suffix)) { return "partial" }
    return $false
  }
  if ($e.Length -ge 8 -and $r.StartsWith($e.Substring(0, [Math]::Min(40, $e.Length)))) { return "partial" }
  if ($null -ne $el -and (Test-IsRichTextEditor $el)) {
    if ($e.Length -ge 12 -and $r.Contains($e.Substring(0, [Math]::Min(80, $e.Length)))) { return "partial" }
  }
  return $false
}

function Clear-TextSelection([IntPtr]$top) {
  Start-Sleep -Milliseconds 40
  [WinInject]::WithTargetInput($top, { [WinInject]::SendKey(0x23) })
}

function Complete-Inject([string]$method, [string]$verifyMode, [IntPtr]$top) {
  Clear-TextSelection $top
  Write-Output "PF_INJECT_VERIFY=$verifyMode"
  Write-Output "PF_INJECT_OK=$method"
  Stop-AnvyllScript 0
}

function Complete-TerminalInject([string]$method, [string]$verifyMode) {
  Write-Output "PF_INJECT_VERIFY=$verifyMode"
  Write-Output "PF_INJECT_OK=$method"
  Stop-AnvyllScript 0
}

function Get-VerifyPollCount([string]$expected) {
  $extra = [Math]::Min(10, [int]($expected.Length / 500))
  return [Math]::Min(16, 4 + $extra)
}

function Wait-TextMatch($el, [string]$expected) {
  $polls = Get-VerifyPollCount $expected
  for ($i = 0; $i -lt $polls; $i++) {
    $mode = Test-TextMatch (Get-ElementTextValue $el) $expected $el
    if ($mode) { return $mode }
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
    Start-Sleep -Milliseconds 150
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
    # Resolve only — the single focus/click happens later in Try-ClipboardPaste.
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

function Invoke-ClipboardReplace([IntPtr]$top, [string]$value, [int]$settleMs) {
  # Skip the write (and its settle) when the clipboard already holds the refined text.
  $current = $null
  try { $current = Get-Clipboard -Raw -ErrorAction Stop } catch {}
  if ($current -ne $value) {
    Set-Clipboard -Value $value
    Start-Sleep -Milliseconds 60
  }
  [WinInject]::WithTargetInput($top, {
    [WinInject]::SendCtrlCombo(0x41)
    Start-Sleep -Milliseconds 30
    [WinInject]::SendCtrlCombo(0x56)
  })
  Start-Sleep -Milliseconds $settleMs
}

function Invoke-ClipboardPasteOnly([IntPtr]$top, [int]$settleMs) {
  [WinInject]::WithTargetInput($top, {
    [WinInject]::SendCtrlCombo(0x56)
  })
  Start-Sleep -Milliseconds $settleMs
}

function Try-ValuePatternSet($el, [string]$value, [IntPtr]$top) {
  if (Test-IsRichTextEditor $el) { return $false }
  try {
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp -and $vp.Current.IsReadOnly -eq $false) {
      $vp.SetValue($value)
      $mode = Wait-TextMatch $el $value
      if ($mode) {
        Complete-Inject "valuePattern" $mode $top
      }
    }
  } catch {}
  return $false
}

function Try-ClipboardPaste($el, [string]$value, [IntPtr]$top, [int]$settleMs, [bool]$trustWithoutVerify) {
  if ($null -ne $el) {
    try {
      $rect = $el.Current.BoundingRectangle
      $x = [int](($rect.Left + $rect.Right) / 2)
      $y = [int](($rect.Top + $rect.Bottom) / 2)
      if ($x -gt 0 -and $y -gt 0) {
        [WinInject]::Click($x, $y)
        Start-Sleep -Milliseconds 100
      }
    } catch {}
    Invoke-ElementFocus $el
  }
  Invoke-ClipboardReplace $top $value $settleMs
  $checkEl = $el
  if ($null -eq $checkEl) { $checkEl = [System.Windows.Automation.AutomationElement]::FocusedElement }
  $mode = Wait-TextMatch $checkEl $value
  if ($mode) {
    Complete-Inject "clipboardPaste" $mode $top
  }
  if ($trustWithoutVerify -and $null -ne $checkEl) {
    Write-Output "PF_INJECT_VERIFY=optimistic"
    Complete-Inject "clipboardPaste" "optimistic" $top
  }
  return $false
}

function Try-UnicodeReplace($el, [string]$value, [IntPtr]$top) {
  [WinInject]::WithTargetInput($top, {
    [WinInject]::SendCtrlCombo(0x41)
    Start-Sleep -Milliseconds 80
    [WinInject]::SendUnicodeText($value)
  })
  Start-Sleep -Milliseconds 200
  $checkEl = $el
  if ($null -eq $checkEl) { $checkEl = [System.Windows.Automation.AutomationElement]::FocusedElement }
  $mode = Wait-TextMatch $checkEl $value
  if ($mode) {
    Complete-Inject "unicode" $mode $top
  }
  return $false
}

function Get-TerminalCopiedInputLine([string]$clip) {
  if ([string]::IsNullOrWhiteSpace($clip)) { return $null }
  $norm = (Normalize-InjectText $clip).Trim()
  $lines = $norm -split "`n"
  for ($i = $lines.Length - 1; $i -ge 0; $i--) {
    $line = $lines[$i].Trim()
    if ($line.Length -gt 0) { return $line }
  }
  return $norm
}

function Compare-TerminalInjectText([string]$actual, [string]$expected) {
  if ($null -eq $actual) { return $false }
  $line = Get-TerminalCopiedInputLine $actual
  if ($null -eq $line) { return $false }
  $e = (Normalize-InjectText $expected).Trim()
  if ($line -eq $e) { return $true }
  if ($e.Length -ge 4 -and $line.Contains($e)) { return $true }
  if ($e.Length -ge 8 -and $line.StartsWith($e.Substring(0, [Math]::Min(40, $e.Length)))) { return $true }
  if ($e.Length -ge 12 -and $line.Contains($e.Substring(0, [Math]::Min(80, $e.Length)))) { return $true }
  return $false
}

function Set-TerminalClipboardText([string]$value) {
  try {
    [System.Windows.Forms.Clipboard]::SetText($value)
  } catch {
    Set-Clipboard -Value $value
  }
  Start-Sleep -Milliseconds 80
}

function Select-TerminalInputLine([long]$hwnd, [bool]$useConhostCopy, [bool]$useIntegratedCopy) {
  $selectHomeEnd = {
    [WinFg]::SendKey(0x24)
    Start-Sleep -Milliseconds 40
    [WinFg]::SendShiftCombo(0x23)
  }
  $selectCtrlA = {
    [WinFg]::SendCtrlCombo(0x41)
  }
  Invoke-WithTargetKeys $hwnd {
    if ($useConhostCopy) {
      & $selectHomeEnd
    } elseif ($useIntegratedCopy) {
      & $selectCtrlA
    } else {
      & $selectHomeEnd
    }
  }
  Start-Sleep -Milliseconds 60
}

function Invoke-TerminalPasteOnly([long]$hwnd) {
  Invoke-WithTargetKeys $hwnd { [WinFg]::SendCtrlCombo(0x56) }
  Start-Sleep -Milliseconds 120
}

function Invoke-TerminalCtrlAReplacePaste([long]$hwnd) {
  Invoke-WithTargetKeys $hwnd {
    [WinFg]::SendCtrlCombo(0x41)
    Start-Sleep -Milliseconds 80
    [WinFg]::SendCtrlCombo(0x56)
  }
  Start-Sleep -Milliseconds 150
}

function Invoke-TerminalHomeEndReplacePaste([long]$hwnd) {
  Invoke-WithTargetKeys $hwnd {
    [WinFg]::SendKey(0x24)
    Start-Sleep -Milliseconds 40
    [WinFg]::SendShiftCombo(0x23)
    Start-Sleep -Milliseconds 60
    [WinFg]::SendCtrlCombo(0x56)
  }
  Start-Sleep -Milliseconds 150
}

function Invoke-TerminalUnicodeReplace([long]$hwnd, [string]$value, [bool]$useConhostCopy) {
  Invoke-WithTargetKeys $hwnd {
    if ($useConhostCopy) {
      [WinFg]::SendKey(0x24)
      Start-Sleep -Milliseconds 40
      [WinFg]::SendShiftCombo(0x23)
    } else {
      [WinFg]::SendCtrlCombo(0x41)
    }
    Start-Sleep -Milliseconds 80
    [WinInject]::SendUnicodeText($value)
  }
  Start-Sleep -Milliseconds 200
}

function Test-TerminalInjectVerified([long]$hwnd, $el, $bounds, [string]$expected, [bool]$useConhostCopy, [bool]$useIntegratedCopy, [string]$strategy) {
  $saved = Save-ClipboardText
  try {
    try { [System.Windows.Forms.Clipboard]::Clear() } catch { Clear-Clipboard -ErrorAction SilentlyContinue }
    $actual = Invoke-TerminalPromptLineCopy $hwnd $el $useConhostCopy $useIntegratedCopy $bounds
    $matched = Compare-TerminalInjectText $actual $expected
    if (-not $matched) {
      $actualLen = if ($null -ne $actual) { $actual.Length } else { 0 }
      Write-Output "PF_INJECT_TERMINAL_VERIFY=$strategy expectedLen=$($expected.Length) actualLen=$actualLen"
    }
    return $matched
  } finally {
    Restore-ClipboardText $saved
  }
}

function Focus-TerminalWithFrozenBounds([long]$hwnd, $el, $bounds, [string]$processName) {
  Focus-TerminalPane $hwnd $el $bounds $processName
}

function Try-TerminalPaste([string]$value, [IntPtr]$top, $el, $bounds, [bool]$useConhostCopy, [string]$processName) {
  $hwnd = $top.ToInt64()
  $useIntegratedCopy = Test-IsIntegratedTerminalHostByProcess $processName
  $savedClip = Save-ClipboardText
  $method = "terminalPaste"

  try {
    Focus-TerminalWithFrozenBounds $hwnd $el $bounds $processName
    Set-TerminalClipboardText $value
    Select-TerminalInputLine $hwnd $useConhostCopy $useIntegratedCopy

    # One paste action — avoid chaining right-click + Ctrl+V (double insert).
    if (Test-IsTerminalRightClickPasteHost $useIntegratedCopy) {
      if ($null -ne (Get-NormalizedBounds $bounds)) {
        [void](Invoke-TerminalRightClickPaste $hwnd $bounds)
        $method = "terminalRightClickPaste"
      } else {
        Invoke-TerminalPasteOnly $hwnd
      }
    } else {
      Invoke-TerminalPasteOnly $hwnd
    }

    Start-Sleep -Milliseconds 100
    # Trust paste when focus + clipboard + single keystroke/mouse action succeeded.
    # Full clipboard readback verify (Ctrl+A + copy) flashes selection and felt like extra mystery steps.
    Complete-TerminalInject $method "optimistic"

    return $false
  } finally {
    Restore-ClipboardText $savedClip
  }
}

$hostKind = "native"
if ($meta -and $meta.hostKind) {
  $hostKind = [string]$meta.hostKind
} elseif ($script:IsChromiumHost) {
  $hostKind = "chromium"
}

if ($hostKind -ne "terminal") {
  [WinInject]::FocusWindow($top)
  # Poll for foreground rather than a flat wait; exits as soon as the target is focused.
  $fgDeadline = [Environment]::TickCount + 300
  while ([Environment]::TickCount -lt $fgDeadline -and [WinInject]::GetForegroundWindow() -ne $top) {
    Start-Sleep -Milliseconds 15
  }

  if ($script:IsChromiumHost) {
    [WinInject]::ActivateChromiumAccessibility($top)
    Start-Sleep -Milliseconds 100
  }
}

# Terminal targets skip field-style element resolve (center click + SetFocus can move focus
# off the terminal input); Try-TerminalPaste owns focus via Focus-TerminalWithFrozenBounds.
$targetEl = $null
if ($hostKind -ne "terminal") {
  $targetEl = Resolve-TargetElement $meta $top
  if ($null -ne $targetEl -and (Test-IsRichTextEditor $targetEl) -and $hostKind -eq "chromium") {
    $hostKind = "richEditor"
  }
}

$className = if ($null -ne $targetEl) { $targetEl.Current.ClassName } else { "(none)" }
Write-Output "PF_INJECT_HOST=$hostKind"
Write-Output "PF_INJECT_TARGET=$className"

$pasteSettleMs = if ($hostKind -eq "richEditor") { 280 } else { 180 }
$trustChromiumPaste = $script:IsChromiumHost -or $hostKind -eq "chromium" -or $hostKind -eq "richEditor"
$terminalUseConhostCopy = $false
if ($meta -and $meta.terminalUseConhostCopy) {
  $terminalUseConhostCopy = [bool]$meta.terminalUseConhostCopy
} elseif ($topCls -eq "ConsoleWindowClass") {
  $terminalUseConhostCopy = $true
}

switch ($hostKind) {
  "terminal" {
    $termBounds = $null
    if ($meta -and $meta.terminalBounds) { $termBounds = $meta.terminalBounds }
    elseif ($meta -and $meta.bounds) { $termBounds = $meta.bounds }
    $termEl = $targetEl
    if ($null -eq $termEl) {
      try {
        $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
        if ($null -ne $focused) { $termEl = Resolve-TerminalPaneElement $focused }
      } catch {}
    }
    if ($null -eq $termBounds -and $null -ne $termEl) {
      $termBounds = Get-TerminalPaneBoundsFromElement $termEl
    }
    $termProcess = if ($meta -and $meta.processName) { [string]$meta.processName } else { "" }
    if ([string]::IsNullOrWhiteSpace($termProcess)) {
      $termProcess = Get-WindowProcessName $top.ToInt64()
    }
    $boundsTag = if ($null -ne (Get-NormalizedBounds $termBounds)) { "yes" } else { "no" }
    Write-Output "PF_INJECT_TERMINAL_META=process=$termProcess bounds=$boundsTag conhost=$terminalUseConhostCopy"
    Try-TerminalPaste $text $top $termEl $termBounds $terminalUseConhostCopy $termProcess
  }
  "native" {
    if ($null -ne $targetEl) {
      Try-ValuePatternSet $targetEl $text $top
    }
    Try-ClipboardPaste $targetEl $text $top $pasteSettleMs $false
    Try-UnicodeReplace $targetEl $text $top
  }
  "chromium" {
    Try-ClipboardPaste $targetEl $text $top $pasteSettleMs $trustChromiumPaste
    Try-UnicodeReplace $targetEl $text $top
  }
  "richEditor" {
    Try-ClipboardPaste $targetEl $text $top $pasteSettleMs $trustChromiumPaste
    Try-UnicodeReplace $targetEl $text $top
  }
  default {
    Try-ClipboardPaste $targetEl $text $top $pasteSettleMs $trustChromiumPaste
    Try-UnicodeReplace $targetEl $text $top
  }
}

Write-Output "PF_INJECT_FAIL=all_methods"
Complete-AnvyllScript 1
return
