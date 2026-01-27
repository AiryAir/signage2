#!/bin/bash
set -e

cd "$(dirname "$0")"

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install dependencies if needed
if [ ! -f "venv/.installed" ]; then
    echo "Installing dependencies..."
    pip install -q -r requirements.txt
    touch venv/.installed
fi

# Create data directory
mkdir -p data static/uploads

# Run the app
echo "Starting server at http://localhost:5000"
python3 app.py
