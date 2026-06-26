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
public static class WinFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@ -ErrorAction SilentlyContinue

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
  return $text
}

function Test-IsTextControl($el) {
  if ($null -eq $el) { return $false }
  try {
    $ct = $el.Current.ControlType.ProgrammaticName
    if ($ct -eq "ControlType.Edit" -or $ct -eq "ControlType.Document") { return $true }
    $cls = $el.Current.ClassName
    if ($cls -match "editor|input|textarea|Omnibox|RichEdit") { return $true }
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

$hwnd = [WinFg]::GetForegroundWindow().ToInt64()
$uiaStatus = "miss"
$charCount = 0
$lastEl = $null

for ($i = 0; $i -lt 3; $i++) {
  try {
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if (Test-IsTextControl $el) {
      $lastEl = $el
      $text = Get-ElementText $el
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

$result = @{
  hwnd  = $hwnd
  uia   = $uiaStatus
  chars = $charCount
}
Write-Output ($result | ConvertTo-Json -Compress)
if ($uiaStatus -eq "ok") { exit 0 }
exit 1
