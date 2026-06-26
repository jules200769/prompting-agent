param(
  [Parameter(Mandatory = $true)]
  [string]$MetaPath,
  [string]$TextPath = ""
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\uia-write-meta.ps1"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

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
        Write-Output "PF_UIA_SNAPSHOT=ok"
        exit 0
      }
    }
  } catch {}
  if ($i -lt 2) { Start-Sleep -Milliseconds 50 }
}

if ($null -ne $lastEl) {
  Write-ElementMeta $lastEl "preCaptureFocus" $MetaPath
  Write-Output "PF_UIA_SNAPSHOT=ok"
  exit 0
}

Write-Output "PF_UIA_SNAPSHOT=miss"
exit 1
