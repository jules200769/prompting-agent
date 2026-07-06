. "$PSScriptRoot\inject-strategy.ps1"

function Write-UiaMetaJson([string]$Path, $MetaObject) {
  $json = $MetaObject | ConvertTo-Json -Compress -Depth 6
  $enc = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $json, $enc)
}

function New-UiaMetaObject($el, [string]$method) {
  $rect = $el.Current.BoundingRectangle
  return [ordered]@{
    method      = $method
    runtimeId   = @($el.GetRuntimeId())
    className   = $el.Current.ClassName
    controlType = $el.Current.ControlType.ProgrammaticName
    bounds      = @{
      left   = [double]$rect.Left
      top    = [double]$rect.Top
      right  = [double]$rect.Right
      bottom = [double]$rect.Bottom
    }
  }
}

function Write-ElementMeta($el, [string]$method, [string]$path, [string]$TopClassName = "", [string]$ProcessName = "") {
  if ([string]::IsNullOrEmpty($path) -or $null -eq $el) { return }
  $meta = New-UiaMetaObject $el $method
  if (-not [string]::IsNullOrEmpty($TopClassName)) {
    $meta.hostKind = Get-HostKind $TopClassName $meta.className $meta.controlType
    $meta.topClassName = $TopClassName
  }
  if (-not [string]::IsNullOrEmpty($ProcessName)) {
    $meta.processName = $ProcessName
  }
  Write-UiaMetaJson $path $meta
}
