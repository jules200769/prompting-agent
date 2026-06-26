param(
  [Parameter(Mandatory = $true)]
  [long]$WindowHandle,
  [string]$MetaPath = ""
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\uia-write-meta.ps1"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-FocusedElementText {
  try {
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
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
    return @{ Element = $el; Text = $text; Method = "focusedElement" }
  } catch {}
  return $null
}

function Get-UiaText([IntPtr]$focusHwnd) {
  if ($focusHwnd -eq [IntPtr]::Zero) { return $null }
  $el = [System.Windows.Automation.AutomationElement]::FromHandle($focusHwnd)
  if ($null -eq $el) { return $null }
  $text = $null
  try {
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp -and $vp.Current.Value) { $text = $vp.Current.Value }
  } catch {}
  if ([string]::IsNullOrEmpty($text)) {
    try {
      $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
      if ($tp) { $text = $tp.DocumentRange.GetText(1000000) }
    } catch {}
  }
  if ([string]::IsNullOrEmpty($text)) { return $null }
  return @{ Element = $el; Text = $text; Method = "uiaFocusHwnd" }
}

$script:BestInjectElement = $null

function Remember-InjectElement($el, [string]$method) {
  if ($null -ne $el) { $script:BestInjectElement = @{ Element = $el; Method = $method } }
}

function Try-RememberFocusedElement([string]$method) {
  try {
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -ne $el) { Remember-InjectElement $el $method }
  } catch {}
}

function Emit-ClipboardCapture([string]$clip, [string]$method) {
  if ($null -ne $script:BestInjectElement) {
    Write-ElementMeta $script:BestInjectElement.Element $script:BestInjectElement.Method $MetaPath
  } else {
    Try-RememberFocusedElement $method
    if ($null -ne $script:BestInjectElement) {
      Write-ElementMeta $script:BestInjectElement.Element $method $MetaPath
    }
  }
  Write-Output $clip
  exit 0
}

function Emit-Capture($result) {
  Write-Output $result.Text
  Write-ElementMeta $result.Element $result.Method $MetaPath
  exit 0
}

Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WinCapture {
  [StructLayout(LayoutKind.Sequential)]
  public struct GUITHREADINFO {
    public int cbSize; public int flags;
    public IntPtr hwndActive; public IntPtr hwndFocus; public IntPtr hwndCapture;
    public IntPtr hwndMenuOwner; public IntPtr hwndMoveSize; public IntPtr hwndCaret;
    public RECT rcCaret;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  public const int WM_GETTEXT = 0x000D;
  public const int WM_GETTEXTLENGTH = 0x000E;
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO lpgui);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, StringBuilder lParam);
  public static IntPtr GetFocusHwnd(IntPtr topLevel) {
    uint tid = GetWindowThreadProcessId(topLevel, IntPtr.Zero);
    var gui = new GUITHREADINFO(); gui.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
    if (!GetGUIThreadInfo(tid, ref gui)) return IntPtr.Zero;
    return gui.hwndFocus;
  }
  public static string GetTextViaMessage(IntPtr hwnd) {
    int len = (int)SendMessage(hwnd, WM_GETTEXTLENGTH, IntPtr.Zero, null);
    if (len <= 0) return null;
    var sb = new StringBuilder(len + 1);
    SendMessage(hwnd, WM_GETTEXT, (IntPtr)(len + 1), sb);
    return sb.ToString();
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
  public static void SendCtrlCombo(byte keyVk) {
    const uint KEYUP = 0x0002;
    keybd_event(0x11, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, 0, UIntPtr.Zero);
    keybd_event(keyVk, 0, KEYUP, UIntPtr.Zero);
    keybd_event(0x11, 0, KEYUP, UIntPtr.Zero);
  }
}
'@ -ErrorAction SilentlyContinue

function Wait-CaptureReady([IntPtr]$topLevel, [int]$timeoutMs = 500, [int]$intervalMs = 50) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
  $lastFocus = [IntPtr]::Zero
  while ([DateTime]::UtcNow -lt $deadline) {
    $fg = [WinCapture]::GetForegroundWindow()
    if ($fg -eq $topLevel) {
      $focus = [WinCapture]::GetFocusHwnd($topLevel)
      if ($focus -ne [IntPtr]::Zero) {
        $lastFocus = $focus
        return $focus
      }
    }
    Start-Sleep -Milliseconds $intervalMs
  }
  if ($lastFocus -ne [IntPtr]::Zero) { return $lastFocus }
  return [WinCapture]::GetFocusHwnd($topLevel)
}

function Invoke-WithTextRetries([scriptblock]$ReadFn, [int]$attempts = 3, [int]$delayMs = 75) {
  for ($i = 0; $i -lt $attempts; $i++) {
    $result = & $ReadFn
    if ($null -ne $result -and -not [string]::IsNullOrEmpty($result.Text)) {
      return $result
    }
    if ($i -lt ($attempts - 1)) { Start-Sleep -Milliseconds $delayMs }
  }
  return $null
}

function Invoke-WithMessageTextRetries([IntPtr]$focusHwnd, [int]$attempts = 3, [int]$delayMs = 75) {
  if ($focusHwnd -eq [IntPtr]::Zero) { return $null }
  for ($i = 0; $i -lt $attempts; $i++) {
    $text = [WinCapture]::GetTextViaMessage($focusHwnd)
    if (-not [string]::IsNullOrEmpty($text)) { return $text }
    if ($i -lt ($attempts - 1)) { Start-Sleep -Milliseconds $delayMs }
  }
  return $null
}

function Wait-ForFocusedElementText([int]$timeoutMs = 500, [int]$intervalMs = 50) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    $result = Get-FocusedElementText
    if ($null -ne $result) { return $result }
    Start-Sleep -Milliseconds $intervalMs
  }
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

function Emit-MessageCapture([IntPtr]$focusHwnd, [string]$text) {
  Try-RememberFocusedElement "wmGetText"
  if ($null -eq $script:BestInjectElement) {
    try {
      $el = [System.Windows.Automation.AutomationElement]::FromHandle($focusHwnd)
      if ($null -ne $el) { Remember-InjectElement $el "wmGetText" }
    } catch {}
  }
  if ($null -ne $script:BestInjectElement) {
    Write-ElementMeta $script:BestInjectElement.Element $script:BestInjectElement.Method $MetaPath
  }
  Write-Output $text
  exit 0
}

$top = [IntPtr]::new($WindowHandle)
$focus = Wait-CaptureReady $top

Try-RememberFocusedElement "initialFocus"

$result = Invoke-WithTextRetries { Get-FocusedElementText }
if ($null -ne $result) { Emit-Capture $result }

$result = Invoke-WithTextRetries { Get-UiaText $focus }
if ($null -ne $result) { Emit-Capture $result }

$focus = [WinCapture]::GetFocusHwnd($top)
if ($focus -ne [IntPtr]::Zero) {
  $text = Invoke-WithMessageTextRetries $focus
  if (-not [string]::IsNullOrEmpty($text)) {
    Emit-MessageCapture $focus $text
  }
}

[WinCapture]::FocusWindow($top)
Try-RememberFocusedElement "afterFocusWindow"
$result = Wait-ForFocusedElementText
if ($null -ne $result) { Emit-Capture $result }

Clear-Clipboard -ErrorAction SilentlyContinue
[WinCapture]::SendCtrlCombo(0x43)
$clip = Wait-ClipboardText
if (-not [string]::IsNullOrEmpty($clip)) {
  Emit-ClipboardCapture $clip "clipboardCopy"
}

[WinCapture]::SendCtrlCombo(0x41)
Start-Sleep -Milliseconds 50
[WinCapture]::SendCtrlCombo(0x43)
$clip = Wait-ClipboardText
if (-not [string]::IsNullOrEmpty($clip)) {
  Emit-ClipboardCapture $clip "clipboardSelectAll"
}

exit 1
