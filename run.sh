#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

# ── Helpers ──────────────────────────────────────────────────────────
RED='\e[1;31m'
GREEN='\e[1;32m'
YELLOW='\e[1;33m'
CYAN='\e[1;36m'
RESET='\e[0m'

info()  { echo -e "${CYAN}$*${RESET}"; }
ok()    { echo -e "${GREEN}$*${RESET}"; }
warn()  { echo -e "${YELLOW}$*${RESET}"; }
err()   { echo -e "${RED}$*${RESET}" >&2; }

# ── Check Python 3.8+ ───────────────────────────────────────────────
check_python() {
    if ! command -v python3 &>/dev/null; then
        err "Python 3 is not installed. Please install Python 3.8 or higher."
        exit 1
    fi
    local ver
    ver=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    local required="3.8"
    if [ "$(printf '%s\n' "$required" "$ver" | sort -V | head -n1)" != "$required" ]; then
        err "Python $required+ required (found $ver)."
        exit 1
    fi
    ok "Python $ver found."
}

# ── First-time setup ────────────────────────────────────────────────
first_time_setup() {
    info "Creating virtual environment..."
    python3 -m venv venv

    source venv/bin/activate

    info "Installing dependencies..."
    pip install -q -r requirements.txt

    mkdir -p data static/uploads

    echo ""
    info "Admin Account Setup"
    info "==================="

    read -rp "Admin username (default: admin): " admin_user
    admin_user="${admin_user:-admin}"

    while true; do
        read -rsp "Admin password (required): " admin_pass
        echo ""
        if [ -n "$admin_pass" ]; then
            break
        fi
        warn "Password cannot be empty. Try again."
    done

    export SIGNAGE_ADMIN_USER="$admin_user"
    export SIGNAGE_ADMIN_PASS="$admin_pass"

    ok "Setup complete!"
    echo ""
    start_server
}

# ── Start server ─────────────────────────────────────────────────────
start_server() {
    source venv/bin/activate
    info "Starting server at http://localhost:5000"
    info "Press Ctrl+C to stop."
    python3 app.py
}

# ── Reset admin password ────────────────────────────────────────────
reset_password() {
    source venv/bin/activate

    read -rp "Admin username (default: admin): " admin_user
    admin_user="${admin_user:-admin}"

    while true; do
        read -rsp "New password (required): " admin_pass
        echo ""
        if [ -n "$admin_pass" ]; then
            break
        fi
        warn "Password cannot be empty. Try again."
    done

    python3 - "$admin_user" "$admin_pass" <<'PYEOF'
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
PYEOF
    ok "Admin password reset successfully."
}

# ── Re-setup (destructive) ──────────────────────────────────────────
re_setup() {
    echo ""
    warn "This will remove the virtual environment and database."
    echo -e "  ${RED}venv/${RESET}"
    echo -e "  ${RED}signage.db${RESET}"
    echo ""
    read -rp "Are you sure? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        info "Cancelled."
        return
    fi

    if [ -d "venv" ]; then
        gio trash "venv"
        ok "Trashed venv/"
    fi
    if [ -f "signage.db" ]; then
        gio trash "signage.db"
        ok "Trashed signage.db"
    fi

    echo ""
    first_time_setup
}

# ── Main ─────────────────────────────────────────────────────────────
check_python

if [ ! -d "venv" ]; then
    first_time_setup
else
    echo ""
    info "Digital Signage"
    info "==============="
    echo "  [1] Start server (default)"
    echo "  [2] Re-setup (remove venv + DB)"
    echo "  [3] Reset admin password"
    echo ""
    read -rp "Choose [1]: " choice
    choice="${choice:-1}"

    case "$choice" in
        1) start_server ;;
        2) re_setup ;;
        3) reset_password ;;
        *) warn "Invalid choice."; exit 1 ;;
    esac
fi
