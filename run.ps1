$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# ── Check Python 3.8+ ───────────────────────────────────────────────
function Test-Python {
    try {
        $output = python --version 2>&1
        if ($output -match "Python (\d+)\.(\d+)") {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 8)) {
                Write-Host "Python 3.8+ required (found $major.$minor)." -ForegroundColor Red
                exit 1
            }
            Write-Host "Python $major.$minor found." -ForegroundColor Green
        } else {
            throw "Could not parse Python version"
        }
    } catch {
        Write-Host "Python 3 is not installed. Please install Python 3.8 or higher." -ForegroundColor Red
        exit 1
    }
}

# ── First-time setup ────────────────────────────────────────────────
function Invoke-FirstTimeSetup {
    Write-Host "Creating virtual environment..." -ForegroundColor Cyan
    python -m venv venv

    & .\venv\Scripts\Activate.ps1

    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    pip install -q -r requirements.txt

    New-Item -ItemType Directory -Force -Path "data" | Out-Null
    New-Item -ItemType Directory -Force -Path "static\uploads" | Out-Null

    Write-Host ""
    Write-Host "Admin Account Setup" -ForegroundColor Cyan
    Write-Host "===================" -ForegroundColor Cyan

    $adminUser = Read-Host "Admin username (default: admin)"
    if ([string]::IsNullOrEmpty($adminUser)) { $adminUser = "admin" }

    do {
        $secPass = Read-Host "Admin password (required)" -AsSecureString
        $adminPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPass))
        if ([string]::IsNullOrEmpty($adminPass)) {
            Write-Host "Password cannot be empty. Try again." -ForegroundColor Yellow
        }
    } while ([string]::IsNullOrEmpty($adminPass))

    $env:SIGNAGE_ADMIN_USER = $adminUser
    $env:SIGNAGE_ADMIN_PASS = $adminPass

    Write-Host "Setup complete!" -ForegroundColor Green
    Write-Host ""
    Start-SignageServer
}

# ── Start server ─────────────────────────────────────────────────────
function Start-SignageServer {
    & .\venv\Scripts\Activate.ps1
    Write-Host "Starting server at http://localhost:5000" -ForegroundColor Cyan
    Write-Host "Press Ctrl+C to stop." -ForegroundColor Cyan
    python app.py
}

# ── Reset admin password ────────────────────────────────────────────
function Reset-AdminPassword {
    & .\venv\Scripts\Activate.ps1

    $adminUser = Read-Host "Admin username (default: admin)"
    if ([string]::IsNullOrEmpty($adminUser)) { $adminUser = "admin" }

    do {
        $secPass = Read-Host "New password (required)" -AsSecureString
        $adminPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPass))
        if ([string]::IsNullOrEmpty($adminPass)) {
            Write-Host "Password cannot be empty. Try again." -ForegroundColor Yellow
        }
    } while ([string]::IsNullOrEmpty($adminPass))

    python -c @"
import sqlite3, hashlib, sys
username, password = sys.argv[1], sys.argv[2]
conn = sqlite3.connect('signage.db')
c = conn.cursor()
pw_hash = hashlib.sha256(password.encode()).hexdigest()
c.execute('SELECT id FROM users WHERE username = ?', (username,))
if c.fetchone():
    c.execute('UPDATE users SET password_hash = ? WHERE username = ?', (pw_hash, username))
else:
    c.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', (username, pw_hash))
conn.commit()
conn.close()
print(f'Password updated for: {username}')
"@ $adminUser $adminPass

    Write-Host "Admin password reset successfully." -ForegroundColor Green
}

# ── Re-setup (destructive) ──────────────────────────────────────────
function Invoke-ReSetup {
    Write-Host ""
    Write-Host "This will remove the virtual environment and database." -ForegroundColor Yellow
    Write-Host "  venv/" -ForegroundColor Red
    Write-Host "  signage.db" -ForegroundColor Red
    Write-Host ""
    $confirm = Read-Host "Are you sure? (y/N)"
    if ($confirm -notmatch "^[Yy]$") {
        Write-Host "Cancelled." -ForegroundColor Cyan
        return
    }

    if (Test-Path "venv") {
        Remove-Item -Recurse -Force "venv"
        Write-Host "Removed venv/" -ForegroundColor Green
    }
    if (Test-Path "signage.db") {
        Remove-Item -Force "signage.db"
        Write-Host "Removed signage.db" -ForegroundColor Green
    }

    Write-Host ""
    Invoke-FirstTimeSetup
}

# ── Main ─────────────────────────────────────────────────────────────
Test-Python

if (-not (Test-Path "venv")) {
    Invoke-FirstTimeSetup
} else {
    Write-Host ""
    Write-Host "Digital Signage" -ForegroundColor Cyan
    Write-Host "===============" -ForegroundColor Cyan
    Write-Host "  [1] Start server (default)"
    Write-Host "  [2] Re-setup (remove venv + DB)"
    Write-Host "  [3] Reset admin password"
    Write-Host ""
    $choice = Read-Host "Choose [1]"
    if ([string]::IsNullOrEmpty($choice)) { $choice = "1" }

    switch ($choice) {
        "1" { Start-SignageServer }
        "2" { Invoke-ReSetup }
        "3" { Reset-AdminPassword }
        default {
            Write-Host "Invalid choice." -ForegroundColor Yellow
            exit 1
        }
    }
}
