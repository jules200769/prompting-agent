# Detect Claude Code approval prompts in a Cursor terminal snapshot and send FULL approval.
param(
    [string]$TerminalFile = "$env:USERPROFILE\.cursor\projects\c-Users-julez-Apps-prompt-master\terminals\10.txt",
    [int]$ClaudeShellPid = 18676
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $TerminalFile)) {
    Write-Output '{"status":"missing_terminal","action":"none"}'
    exit 0
}

$raw = Get-Content -Raw -Encoding UTF8 $TerminalFile

$approvalPatterns = @(
    'proceed\?',
    'Do you want to (proceed|run|allow)',
    'requires approval',
    'Bash command requires approval',
    'Allow (once|for this)',
    '❯\s*1\.\s*Yes',
    '\(y\)es.*\(a\)lways',
    'yes\.\.\.',
    'yes…',
    'ctrl\+b to run in background'
)

$matched = $false
foreach ($p in $approvalPatterns) {
    if ($raw -match $p) { $matched = $true; break }
}

if (-not $matched) {
    Write-Output '{"status":"no_approval_prompt","action":"none"}'
    exit 0
}

# FULL approval: numbered menu option 2 (Yes + don't ask again) or (a)lways shortcut.
$keySequence = '2{ENTER}'
if ($raw -match '\(a\)lways') { $keySequence = 'a{ENTER}' }
elseif ($raw -match 'Allow for this session') { $keySequence = '{DOWN}{ENTER}' }

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class ApprovalKeys {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@

$targetHwnd = [IntPtr]::Zero
$root = Get-Process -Id $ClaudeShellPid -ErrorAction SilentlyContinue
if (-not $root) {
    Write-Output '{"status":"approval_detected","action":"skipped","reason":"claude_pid_gone"}'
    exit 0
}

$pidSet = [System.Collections.Generic.HashSet[int]]::new()
$stack = [System.Collections.Generic.Stack[int]]::new()
$stack.Push($root.Id)
while ($stack.Count -gt 0) {
    $id = $stack.Pop()
    if (-not $pidSet.Add($id)) { continue }
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$id" -ErrorAction SilentlyContinue |
        ForEach-Object { $stack.Push($_.ProcessId) }
}

[ApprovalKeys]::EnumWindows({
    param($hWnd, $lParam)
    $winPid = 0
    [void][ApprovalKeys]::GetWindowThreadProcessId($hWnd, [ref]$winPid)
    if ($pidSet.Contains([int]$winPid)) {
        $sb = New-Object System.Text.StringBuilder 512
        [void][ApprovalKeys]::GetWindowText($hWnd, $sb, 512)
        $title = $sb.ToString()
        if ($title -match 'claude|powershell|Windows PowerShell|Command Prompt|Terminal') {
            $script:targetHwnd = $hWnd
            return $false
        }
    }
    return $true
}, [IntPtr]::Zero) | Out-Null

if ($targetHwnd -eq [IntPtr]::Zero) {
    Write-Output '{"status":"approval_detected","action":"skipped","reason":"no_console_hwnd"}'
    exit 0
}

[void][ApprovalKeys]::ShowWindow($targetHwnd, 9)
[void][ApprovalKeys]::SetForegroundWindow($targetHwnd)
Start-Sleep -Milliseconds 400

$wshell = New-Object -ComObject WScript.Shell
[void]$wshell.AppActivate([ApprovalKeys]::GetWindowText($targetHwnd, (New-Object System.Text.StringBuilder 512), 512).ToString())
Start-Sleep -Milliseconds 200
$wshell.SendKeys($keySequence)

Write-Output ("{0}" -f (@{
    status = 'approval_detected'
    action = 'sent_full_approval'
    keys   = $keySequence
} | ConvertTo-Json -Compress))
