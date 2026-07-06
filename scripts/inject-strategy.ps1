function Test-IsRichEditorClassName([string]$className, [string]$controlType) {
  if ($className -match "aislash|monaco|ProseMirror|contenteditable|CodeMirror|ace_editor|inputarea") { return $true }
  if ($controlType -eq "ControlType.Document") { return $true }
  return $false
}

function Get-HostKind([string]$topClassName, [string]$elementClassName, [string]$controlType) {
  if (Test-IsRichEditorClassName $elementClassName $controlType) { return "richEditor" }
  if ($topClassName -match "Chrome_WidgetWin") { return "chromium" }
  return "native"
}
