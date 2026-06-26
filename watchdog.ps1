# FELLITO Tunnel Watchdog — runs via Windows Task Scheduler every 5 min
$projectDir = "C:\Users\Fellito Rodriguez\Grahpics\fellito-epic-ate-agent"
$logFile    = "$projectDir\watchdog.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts  $msg" | Out-File -Append -FilePath $logFile -Encoding utf8
}

# ── Check if server is up ─────────────────────────────────────────────────────
$serverUp = $false
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    $serverUp = $r.StatusCode -eq 200
} catch {}

if (-not $serverUp) {
    Log "Server DOWN — restarting..."
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 2
    $backendDir = "$projectDir\backend"
    Start-Process -NoNewWindow -FilePath "node" -ArgumentList "server.js" `
        -WorkingDirectory $backendDir `
        -RedirectStandardOutput "$backendDir\server.log" `
        -RedirectStandardError  "$backendDir\server-err.log"
    Start-Sleep 5
    Log "Server restarted."
}

# ── Check tunnel ──────────────────────────────────────────────────────────────
$lhrLog   = "C:\Users\Fellito Rodriguez\.lhr.log"
$tunnelUrl = $null
$tunnelUp  = $false

if (Test-Path $lhrLog) {
    $content = Get-Content $lhrLog -Raw
    if ($content -match 'https://[^\s]+\.lhr\.life') {
        $tunnelUrl = $Matches[0].Trim()
        try {
            $r2 = Invoke-WebRequest -Uri "$tunnelUrl/health" -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop
            $tunnelUp = $r2.StatusCode -eq 200
        } catch {}
    }
}

if (-not $tunnelUp) {
    Log "Tunnel DOWN — restarting..."

    # Kill old SSH processes
    Get-Process -Name "ssh" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 2

    # Start new tunnel via bash
    $bashExe = "C:\Program Files\Git\bin\bash.exe"
    if (-not (Test-Path $bashExe)) { $bashExe = (Get-Command bash -ErrorAction SilentlyContinue)?.Source }

    if ($bashExe) {
        $lhrLogBash = "/c/Users/Fellito Rodriguez/.lhr.log"
        Start-Process -NoNewWindow -FilePath $bashExe -ArgumentList "-c", `
            "ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -R 80:localhost:3001 nokey@localhost.run > '$lhrLogBash' 2>&1 &"
        Start-Sleep 12

        # Get new URL
        if (Test-Path $lhrLog) {
            $content2 = Get-Content $lhrLog -Raw
            if ($content2 -match 'https://[^\s]+\.lhr\.life') {
                $tunnelUrl = $Matches[0].Trim()
                Log "New tunnel: $tunnelUrl"
            }
        }
    }

    if ($tunnelUrl) {
        Log "New tunnel URL: $tunnelUrl"
    }
} else {
    Log "Tunnel OK: $tunnelUrl"
}
