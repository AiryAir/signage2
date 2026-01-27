$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Create venv if it doesn't exist
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..."
    python -m venv venv
}

# Activate venv
& .\venv\Scripts\Activate.ps1

# Install dependencies if needed
if (-not (Test-Path "venv\.installed")) {
    Write-Host "Installing dependencies..."
    pip install -q -r requirements.txt
    New-Item -Path "venv\.installed" -ItemType File | Out-Null
}

# Create directories
New-Item -ItemType Directory -Force -Path "data" | Out-Null
New-Item -ItemType Directory -Force -Path "static\uploads" | Out-Null

# Run the app
Write-Host "Starting server at http://localhost:5000"
python app.py
