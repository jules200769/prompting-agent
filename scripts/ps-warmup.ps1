$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WinInjectWarmup {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
}
'@ -ErrorAction SilentlyContinue
Write-Output "PF_WARMUP=ok"
