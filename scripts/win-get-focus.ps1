param(
  [Parameter(Mandatory = $true)]
  [long]$WindowHandle
)

$ErrorActionPreference = "Stop"

Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WinFocus {
  [StructLayout(LayoutKind.Sequential)]
  public struct GUITHREADINFO {
    public int cbSize;
    public int flags;
    public IntPtr hwndActive;
    public IntPtr hwndFocus;
    public IntPtr hwndCapture;
    public IntPtr hwndMenuOwner;
    public IntPtr hwndMoveSize;
    public IntPtr hwndCaret;
    public RECT rcCaret;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO lpgui);

  public static long GetFocusHwnd(IntPtr topLevel) {
    uint tid = GetWindowThreadProcessId(topLevel, IntPtr.Zero);
    var gui = new GUITHREADINFO();
    gui.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
    if (!GetGUIThreadInfo(tid, ref gui)) return 0;
    return gui.hwndFocus.ToInt64();
  }
}
'@ -ErrorAction SilentlyContinue

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$top = [IntPtr]::new($WindowHandle)
$focus = [WinFocus]::GetFocusHwnd($top)

try {
  $el = [System.Windows.Automation.AutomationElement]::FocusedElement
  if ($null -ne $el) {
    $native = $el.Current.NativeWindowHandle
    if ($native -ne 0) {
      Write-Output $native
      exit 0
    }
  }
} catch {}

if ($focus -ne 0) {
  Write-Output $focus
  exit 0
}

Write-Output 0
