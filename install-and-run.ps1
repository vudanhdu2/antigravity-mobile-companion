$ErrorActionPreference = "Stop"
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  🛡️  ANTIGRAVITY MOBILE COMPANION — CÀI ĐẶT & CHẠY 1-CHẠM (SELF-HOST)" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

$TargetDir = Join-Path $HOME "antigravity-mobile-companion"
if (-not ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot "companion_server.py")))) {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        if (Test-Path (Join-Path $TargetDir ".git")) {
            Write-Host "[*] Đang cập nhật bản mới nhất từ GitHub..." -ForegroundColor Yellow
            try {
                git -C $TargetDir fetch origin main --quiet
                git -C $TargetDir reset --hard origin/main --quiet
            } catch {
                git -C $TargetDir pull --ff-only
            }
        } else {
            if (Test-Path $TargetDir) { Remove-Item $TargetDir -Recurse -Force -ErrorAction SilentlyContinue }
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
    $TargetDir = $PSScriptRoot
    Set-Location $PSScriptRoot
}

$pyExe = "python"
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    $candPy = Join-Path $env:LOCALAPPDATA "Python\pythoncore-3.14-64\python.exe"
    if (Test-Path $candPy) { $pyExe = $candPy }
}

# Đăng ký tự khởi động cùng Windows (hỗ trợ cả Laptop chạy Pin)
try {
    $scriptFile = Join-Path $TargetDir "companion_server.py"
    $pyFull = (Get-Command $pyExe -ErrorAction Stop).Source
    $stAction = New-ScheduledTaskAction -Execute $pyFull -Argument ("`"{0}`" --tunnel --detach --no-browser" -f $scriptFile) -WorkingDirectory $TargetDir
    $stTrigger = New-ScheduledTaskTrigger -AtLogOn
    $stSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName "AgMobileCompanionWatchdog" -Action $stAction -Trigger $stTrigger -Settings $stSettings -Force -ErrorAction SilentlyContinue | Out-Null
} catch {}

Write-Host "[+] Đang khởi chạy Antigravity Mobile Companion ở chế độ WMI Detached (Chống ngắt Error 1033 khi đóng phiên AI)..." -ForegroundColor Green
& $pyExe companion_server.py --tunnel --detach
