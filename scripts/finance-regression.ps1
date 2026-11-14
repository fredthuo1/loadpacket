param([switch]$Full)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$savedLocation = Get-Location
$names = @('DATABASE_URL','RUN_FINANCE_DATABASE_TESTS','RUN_MOBILE_DATABASE_TESTS','PATH')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  Set-Location -LiteralPath $repo
  $bundledNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin'
  if (Test-Path -LiteralPath (Join-Path $bundledNode 'node.exe')) { $env:PATH = $bundledNode + ';' + $env:PATH }
  # This URL is deliberately fixed. Never load the configured application DB for this gate.
  $env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:55439/loadpacket_finance_verified_test'
  $env:RUN_FINANCE_DATABASE_TESTS = '1'
  if ($Full) {
    $env:RUN_MOBILE_DATABASE_TESTS = '1'
    & node scripts/release-gate.cjs --scope=full
  } else {
    & pnpm --config.verify-deps-before-run=false --filter api exec node test/finance.database.cjs
  }
  if ($LASTEXITCODE -ne 0) { throw "Finance regression failed (exit $LASTEXITCODE). See output above." }
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
  Set-Location -LiteralPath $savedLocation.Path
}
