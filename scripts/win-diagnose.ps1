param(
  [long]$WindowHandle = 0
)

$ErrorActionPreference = "Continue"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Describe-Element($el, [string]$label) {
  if ($null -eq $el) {
    Write-Output "$label : (null)"
    return
  }
  $ct = $el.Current.ControlType.ProgrammaticName
  $native = $el.Current.NativeWindowHandle
  $name = $el.Current.Name
  $class = $el.Current.ClassName
  $autoId = $el.Current.AutomationId
  $rect = $el.Current.BoundingRectangle
  $rid = ($el.GetRuntimeId() -join ",")
  Write-Output "$label : ControlType=$ct NativeHwnd=$native Class=$class AutoId=$autoId"
  Write-Output "  Name=$name"
  Write-Output "  Bounds=$rect RuntimeId=$rid"
  try {
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    Write-Output "  ValuePattern=yes ReadOnly=$($vp.Current.IsReadOnly) ValueLen=$($vp.Current.Value.Length)"
  } catch { Write-Output "  ValuePattern=no" }
  try {
    $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    $sample = $tp.DocumentRange.GetText(80)
    Write-Output "  TextPattern=yes SampleLen=$($sample.Length)"
  } catch { Write-Output "  TextPattern=no" }
}

Write-Output "=== FocusedElement (global) ==="
Describe-Element ([System.Windows.Automation.AutomationElement]::FocusedElement) "Focused"

if ($WindowHandle -gt 0) {
  $top = [IntPtr]::new($WindowHandle)
  Write-Output "=== FromHandle $WindowHandle ==="
  Describe-Element ([System.Windows.Automation.AutomationElement]::FromHandle($top)) "TopLevel"

  $cond = New-Object System.Windows.Automation.OrCondition(
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)),
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document))
  )
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($top)
  $found = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
  Write-Output "Edit/Document descendants: $($found.Count)"
  $max = [Math]::Min(3, $found.Count)
  for ($i = 0; $i -lt $max; $i++) {
    Describe-Element $found[$i] "  Descendant[$i]"
  }
}
