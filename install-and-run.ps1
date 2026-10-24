$ErrorActionPreference = "Stop"
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  🛡️  ANTIGRAVITY MOBILE COMPANION — CÀI ĐẶT & CHẠY 1-CHẠM (SELF-HOST)" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

$TargetDir = Join-Path $HOME "antigravity-mobile-companion"
if (-not (Test-Path (Join-Path $PSScriptRoot "companion_server.py"))) {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        if (Test-Path $TargetDir) {
            Write-Host "[*] Đang cập nhật bản mới nhất từ GitHub..." -ForegroundColor Yellow
            git -C $TargetDir pull --ff-only
        } else {
            Write-Host "[*] Đang tải bộ Antigravity Mobile Companion về $TargetDir..." -ForegroundColor Yellow
            git clone https://github.com/vudanhdu2/antigravity-mobile-companion.git $TargetDir
        }
    } else {
        $ZipPath = Join-Path $env:TEMP "ag-companion.zip"
        Invoke-WebRequest -Uri "https://github.com/vudanhdu2/antigravity-mobile-companion/archive/refs/heads/main.zip" -OutFile $ZipPath
        Expand-Archive -Path $ZipPath -DestinationPath $env:TEMP -Force
        if (Test-Path $TargetDir) { Remove-Item $TargetDir -Recurse -Force }
        Move-Item (Join-Path $env:TEMP "antigravity-mobile-companion-main") $TargetDir
    }
    Set-Location $TargetDir
} else {
    Set-Location $PSScriptRoot
}

Write-Host "[+] Đang khởi chạy Antigravity Mobile Companion (kèm Cloudflare Tunnel 4G/5G + Mã PIN)..." -ForegroundColor Green
python companion_server.py --tunnel
