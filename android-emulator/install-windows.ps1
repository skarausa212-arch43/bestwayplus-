# One-time setup on Windows.
#
#   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
#
# Installs the Node dependencies, fetches the Chromium build Playwright expects,
# clears the Mark of the Web from the bundled proxy binary, and runs a smoke
# test. Safe to re-run.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Say($m) { Write-Host "`n$m" -ForegroundColor Cyan }
function Die($m) { Write-Host "`n$m" -ForegroundColor Red; exit 1 }

Say 'Checking Node'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die 'Node 20+ is required. Install it from https://nodejs.org'
}
$major = [int](node -p 'process.versions.node.split(".")[0]')
if ($major -lt 20) { Die "Node $major found, but 20+ is required." }
Write-Host "node $(node -v), $(node -p 'process.arch')"

Say 'Selecting the proxy binary'
$arch  = node -p 'process.arch'
$proxy = "tools\tlsproxy\bin\tlsproxy-win32-$arch.exe"
if (-not (Test-Path $proxy)) {
  Die "No bundled proxy for win32-$arch. Build one with: cd tools\tlsproxy; go build -o bin\tlsproxy-win32-$arch.exe ."
}

# Anything downloaded through a browser carries the Mark of the Web, and an
# unsigned executable then gets blocked or flagged. Clearing it on the bundled
# binaries is all that is needed.
Get-ChildItem 'tools\tlsproxy\bin\*' | Unblock-File
Write-Host $proxy

Say 'Installing dependencies'
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Die 'npm install failed.' }

Say 'Installing the matching Chromium'
npx playwright install chromium
if ($LASTEXITCODE -ne 0) { Die 'playwright install failed.' }

Say 'Smoke test: TLS fingerprint'
node bin\cli.js tls pixel-8-pro
if ($LASTEXITCODE -ne 0) { Die 'The proxy could not produce a fingerprint.' }

Say 'Smoke test: full emulation'
node bin\cli.js verify pixel-8-pro
if ($LASTEXITCODE -ne 0) { Die "Verification reported failures. Run 'node bin\cli.js verify pixel-8-pro' for detail." }

Write-Host @'

Ready. Run everything from this folder:

  node bin\cli.js devices
  node bin\cli.js verify galaxy-s23-ultra
  node bin\cli.js open  pixel-8-pro https://example.com

There is no "andro" command unless you run `npm link` first.

One caveat before you rely on font emulation: docs\windows.md — Chromium uses
DirectWrite here and ignores fontconfig, so the DOM-based font probe cannot be
closed on this platform.
'@
