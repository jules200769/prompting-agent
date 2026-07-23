# Resident STA PowerShell bridge for Anvyll capture/inject.
# File-based IPC (Electron/Node stdin+stdout pipes are unreliable with PowerShell -File).
#
# Env: ANVYLL_BRIDGE_DIR = working directory for ready/req/res files
# Ready:  <dir>/ready.json
# Req:   <dir>/req-<id>.json   →  <dir>/res-<id>.json
# Stop:   <dir>/shutdown

$ErrorActionPreference = "Continue"
$env:ANVYLL_BRIDGE = "1"
$scriptRoot = $PSScriptRoot
if ([string]::IsNullOrEmpty($scriptRoot)) {
  $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$global:AnvyllBridgeExitCode = 0

$bridgeDir = $env:ANVYLL_BRIDGE_DIR
if ([string]::IsNullOrEmpty($bridgeDir)) {
  $bridgeDir = Join-Path $env:TEMP "anvyll-ps-bridge"
}
New-Item -ItemType Directory -Force -Path $bridgeDir | Out-Null

$diagPath = Join-Path $bridgeDir "diag.log"
function Write-BridgeDiag([string]$msg) {
  try {
    [System.IO.File]::AppendAllText($diagPath, "$(Get-Date -Format o) $msg$([Environment]::NewLine)")
  } catch {}
}

Write-BridgeDiag "boot root=$scriptRoot pid=$PID dir=$bridgeDir"

try {
  . "$scriptRoot\bridge-compat.ps1"
  . "$scriptRoot\terminal-io.ps1"
  . "$scriptRoot\uia-write-meta.ps1"
  . "$scriptRoot\inject-strategy.ps1"
  Add-Type -AssemblyName UIAutomationClient -ErrorAction SilentlyContinue
  Add-Type -AssemblyName UIAutomationTypes -ErrorAction SilentlyContinue
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
  Write-BridgeDiag "preload ok"
} catch {
  Write-BridgeDiag "preload failed: $($_.Exception.Message)"
  exit 1
}

function Write-BridgeResponseFile([string]$path, $obj) {
  $json = ($obj | ConvertTo-Json -Compress -Depth 8)
  $tmp = "$path.tmp"
  [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding $false))
  Move-Item -LiteralPath $tmp -Destination $path -Force
}

function Invoke-BridgeScript {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptName,
    [hashtable]$Params = @{}
  )
  $global:AnvyllBridgeExitCode = 1
  $scriptPath = Join-Path $scriptRoot $ScriptName
  if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "script not found: $ScriptName"
  }
  $parts = New-Object System.Collections.Generic.List[string]
  try {
    & $scriptPath @Params 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) {
        $msg = $_.Exception.Message
        if ($msg -eq "ANVYLL_BRIDGE_COMPLETE") {
          throw $_
        }
        [void]$parts.Add($_.ToString())
      } else {
        [void]$parts.Add([string]$_)
      }
    }
  } catch {
    $msg = $_.Exception.Message
    if ($msg -ne "ANVYLL_BRIDGE_COMPLETE" -and "$($_)" -notmatch "ANVYLL_BRIDGE_COMPLETE") {
      throw
    }
  }
  return @{
    stdout = ($parts -join "`n").Trim()
    code   = [int]$global:AnvyllBridgeExitCode
  }
}

function Invoke-BridgeRequest($req) {
  $id = [string]$req.id
  $cmd = [string]$req.cmd
  if ([string]::IsNullOrEmpty($cmd)) {
    return @{ id = $id; ok = $false; error = "missing_cmd" }
  }

  if ($cmd -eq "shutdown") {
    return @{ id = $id; ok = $true; cmd = $cmd; stdout = "bye"; code = 0; _shutdown = $true }
  }

  if ($cmd -eq "ping") {
    return @{ id = $id; ok = $true; cmd = $cmd; stdout = "pong"; code = 0 }
  }

  try {
    $argsObj = $req.args
    $result = $null
    switch ($cmd) {
      "snapshot" {
        $p = @{ MetaPath = [string]$argsObj.MetaPath }
        if ($argsObj.TextPath) { $p.TextPath = [string]$argsObj.TextPath }
        if ($argsObj.ContextPath) { $p.ContextPath = [string]$argsObj.ContextPath }
        if ($null -ne $argsObj.TargetHwnd -and [long]$argsObj.TargetHwnd -gt 0) {
          $p.TargetHwnd = [long]$argsObj.TargetHwnd
        }
        $result = Invoke-BridgeScript -ScriptName "win-hotkey-snapshot.ps1" -Params $p
      }
      "capture" {
        $p = @{ WindowHandle = [long]$argsObj.WindowHandle }
        if ($argsObj.MetaPath) { $p.MetaPath = [string]$argsObj.MetaPath }
        $result = Invoke-BridgeScript -ScriptName "win-capture.ps1" -Params $p
      }
      "inject" {
        $p = @{
          WindowHandle = [long]$argsObj.WindowHandle
          TextPath     = [string]$argsObj.TextPath
        }
        if ($argsObj.MetaPath) { $p.MetaPath = [string]$argsObj.MetaPath }
        $result = Invoke-BridgeScript -ScriptName "win-inject.ps1" -Params $p
      }
      default {
        return @{ id = $id; ok = $false; cmd = $cmd; error = "unknown_cmd" }
      }
    }
    return @{
      id     = $id
      ok     = $true
      cmd    = $cmd
      stdout = $result.stdout
      code   = $result.code
    }
  } catch {
    return @{
      id     = $id
      ok     = $false
      cmd    = $cmd
      stdout = ""
      code   = 1
      error  = $_.Exception.Message
    }
  }
}

# Clear stale control files from a previous host.
Remove-Item -LiteralPath (Join-Path $bridgeDir "ready.json") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $bridgeDir "shutdown") -Force -ErrorAction SilentlyContinue
Get-ChildItem -LiteralPath $bridgeDir -Filter "req-*.json" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -LiteralPath $bridgeDir -Filter "res-*.json" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

Write-BridgeResponseFile (Join-Path $bridgeDir "ready.json") @{
  event = "ready"
  pid   = $PID
}
Write-BridgeDiag "ready file written"

while ($true) {
  if (Test-Path -LiteralPath (Join-Path $bridgeDir "shutdown")) {
    Write-BridgeDiag "shutdown file"
    break
  }

  $reqs = @(Get-ChildItem -LiteralPath $bridgeDir -Filter "req-*.json" -ErrorAction SilentlyContinue | Sort-Object Name)
  if ($reqs.Count -eq 0) {
    Start-Sleep -Milliseconds 15
    continue
  }

  foreach ($reqFile in $reqs) {
    $raw = $null
    try {
      $raw = [System.IO.File]::ReadAllText($reqFile.FullName)
    } catch {
      continue
    }
    try {
      Remove-Item -LiteralPath $reqFile.FullName -Force -ErrorAction SilentlyContinue
    } catch {}

    $req = $null
    try {
      $req = $raw | ConvertFrom-Json
    } catch {
      $idGuess = ($reqFile.BaseName -replace '^req-', '')
      Write-BridgeResponseFile (Join-Path $bridgeDir "res-$idGuess.json") @{
        id = $idGuess; ok = $false; error = "invalid_json"
      }
      continue
    }

    $resp = Invoke-BridgeRequest $req
    $id = [string]$resp.id
    if ([string]::IsNullOrEmpty($id)) { $id = ($reqFile.BaseName -replace '^req-', '') }
    $doShutdown = $false
    try { $doShutdown = [bool]$resp._shutdown } catch {}
    $out = @{
      id     = $id
      ok     = [bool]$resp.ok
      cmd    = [string]$resp.cmd
      stdout = [string]$resp.stdout
      code   = [int]($(if ($null -ne $resp.code) { $resp.code } else { 1 }))
    }
    if ($resp.error) { $out.error = [string]$resp.error }
    Write-BridgeResponseFile (Join-Path $bridgeDir "res-$id.json") $out
    Write-BridgeDiag "handled cmd=$($out.cmd) id=$id"
    if ($doShutdown) {
      Write-BridgeDiag "shutdown cmd"
      exit 0
    }
  }
}

exit 0
