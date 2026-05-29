# Export contract ABIs to contracts/exports/abis/ for consumption by agent/ and web/.
# Policy.sol contains only enums/struct/library (no deployable contract) so it is
# intentionally omitted — its types are embedded in SolventVault.json's ABI anyway.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "exports/abis"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$contracts = @(
    @{ Name = "SolventVault"; Path = "src/SolventVault.sol" },
    @{ Name = "SolventAttestation"; Path = "src/SolventAttestation.sol" },
    @{ Name = "AgniDexAdapter"; Path = "src/adapters/AgniDexAdapter.sol" },
    @{ Name = "InitLendingAdapter"; Path = "src/adapters/InitLendingAdapter.sol" }
)

foreach ($c in $contracts) {
    $lines = $null
    try {
        # --json emits a proper JSON array; stderr carries only warnings (exit 255 is harmless)
        $lines = (forge inspect "$($c.Path):$($c.Name)" abi --json 2>&1) |
                 Where-Object { $_ -notmatch "^Error:" -and $_ -notmatch "^warning\[" }
    } catch {
        $lines = $null
    }
    $json = if ($lines) { $lines -join "`n" } else { "" }
    if (-not $json -or $json.Trim() -eq "") {
        Write-Warning "Failed to inspect $($c.Name); skipping"
        continue
    }
    # Validate it is parseable JSON before writing
    try { $null = $json | ConvertFrom-Json } catch {
        Write-Warning "$($c.Name): output is not valid JSON; skipping"
        continue
    }
    $json | Set-Content -Path (Join-Path $out "$($c.Name).json") -Encoding utf8
    Write-Host "exported $($c.Name).json"
}
