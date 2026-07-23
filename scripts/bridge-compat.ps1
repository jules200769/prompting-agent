# Shared exit helper for Anvyll PS scripts when run under ps-bridge-host.ps1.
# Standalone `powershell -File script.ps1` still uses real `exit` (process ends).
# Under the bridge, `exit` would kill the resident host — use Complete/Stop instead.

function Complete-AnvyllScript {
  param([Parameter(Mandatory = $true)][int]$Code)
  if ($env:ANVYLL_BRIDGE -eq '1') {
    $global:AnvyllBridgeExitCode = $Code
    return
  }
  exit $Code
}

# Use from nested functions that previously called `exit` (return alone only leaves the function).
function Stop-AnvyllScript {
  param([Parameter(Mandatory = $true)][int]$Code)
  Complete-AnvyllScript $Code
  if ($env:ANVYLL_BRIDGE -eq '1') {
    throw "ANVYLL_BRIDGE_COMPLETE"
  }
}
