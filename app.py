#!/usr/bin/env python3
"""
Digital Signage Application
A browser-based digital signage system built with Flask and vanilla JavaScript.
"""

import os
import json
import sqlite3
import hashlib
import secrets
import time
import urllib.request
import urllib.parse
from datetime import datetime
from functools import wraps
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
from werkzeug.utils import secure_filename
import feedparser

# In-memory cache for weather data
_weather_cache = {}
WEATHER_CACHE_TTL = 600  # 10 minutes

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(16))
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file upload

# Configuration
UPLOAD_FOLDER = 'static/uploads'
DATABASE_FILE = 'signage.db'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def init_database():
    """Initialize the SQLite database with required tables."""
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Displays table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS displays (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            layout_config TEXT,
            background_config TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create default admin user if none exists
    cursor.execute('SELECT COUNT(*) FROM users')
    if cursor.fetchone()[0] == 0:
        # Check for custom admin credentials from environment
        admin_username = os.environ.get('SIGNAGE_ADMIN_USER', 'admin')
        admin_password = os.environ.get('SIGNAGE_ADMIN_PASS', 'admin123')
        admin_password_hash = hashlib.sha256(admin_password.encode()).hexdigest()
        cursor.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)',
                      (admin_username, admin_password_hash))
    
    # Create default display if none exists
    cursor.execute('SELECT COUNT(*) FROM displays')
    if cursor.fetchone()[0] == 0:
        default_layout = json.dumps({
            'grid': {'rows': 2, 'cols': 2},
            'zones': [
                {
                    'id': 0, 
                    'type': 'clock', 
                    'content': '', 
                    'opacity': 1.0,
                    'font_family': 'Arial, sans-serif',
                    'font_size': '16px',
                    'background': {'type': 'transparent'},
                    'date_format': 'full',
                    'time_format': '24h'
                },
                {
                    'id': 1, 
                    'type': 'iframe', 
                    'content': '', 
                    'opacity': 1.0,
                    'font_family': 'Arial, sans-serif',
                    'font_size': '16px',
                    'background': {'type': 'transparent'}
                },
                {
                    'id': 2, 
                    'type': 'announcement', 
                    'content': 'Welcome to Digital Signage!', 
                    'opacity': 1.0,
                    'font_family': 'Arial, sans-serif',
                    'font_size': '24px',
                    'background': {'type': 'glassmorphism', 'blur': 10, 'opacity': 0.2}
                },
                {
                    'id': 3, 
                    'type': 'rss', 
                    'content': '', 
                    'opacity': 1.0,
                    'font_family': 'Arial, sans-serif',
                    'font_size': '14px',
                    'background': {'type': 'transparent'}
                }
            ],
            'global_font': 'Arial, sans-serif',
            'top_bar': {'mode': 'visible', 'show_seconds': True}
        })
        default_background = json.dumps({'type': 'color', 'value': '#1a1a1a'})
        cursor.execute('INSERT INTO displays (name, description, layout_config, background_config) VALUES (?, ?, ?, ?)',
                      ('Default Display', 'Default digital signage display', default_layout, default_background))
    
    conn.commit()
    conn.close()

def allowed_file(filename):
    """Check if uploaded file has allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def hash_password(password):
    """Hash password using SHA256."""
    return hashlib.sha256(password.encode()).hexdigest()

def require_auth(f):
    """Decorator to require authentication."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def index():
    """Home page - redirects to display list."""
    return redirect(url_for('displays'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Login page."""
    if request.method == 'POST':
        username = request.json.get('username')
        password = request.json.get('password')
        
        if not username or not password:
            return jsonify({'success': False, 'message': 'Username and password required'}), 400
        
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT id, password_hash FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        conn.close()
        
        if user and user[1] == hash_password(password):
            session['user_id'] = user[0]
            session['username'] = username
            return jsonify({'success': True, 'message': 'Login successful'})
        else:
            return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    """Logout and clear session."""
    session.clear()
    return redirect(url_for('login'))

@app.route('/admin')
@require_auth
def admin():
    """Admin page - redirects to displays."""
    return redirect(url_for('displays'))

@app.route('/displays')
@require_auth
def displays():
    """Display management page."""
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, description, created_at FROM displays ORDER BY created_at DESC')
    displays_list = cursor.fetchall()
    conn.close()
    
    return render_template('displays.html', displays=displays_list)

@app.route('/display/<int:display_id>')
@require_auth
def display_config(display_id):
    """Display configuration page."""
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM displays WHERE id = ?', (display_id,))
    display = cursor.fetchone()
    conn.close()
    
    if not display:
        return redirect(url_for('displays'))
    
    return render_template('display_config.html', display=display)

@app.route('/player/<int:display_id>')
def player(display_id):
    """Fullscreen player page (no auth required for viewing)."""
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM displays WHERE id = ?', (display_id,))
    display = cursor.fetchone()
    conn.close()
    
    if not display:
        return "Display not found", 404
    
    # Parse the JSON configuration
    try:
        layout_config = json.loads(display[3])
        background_config = json.loads(display[4])
    except json.JSONDecodeError as e:
        return f"Invalid display configuration: {e}", 500
    
    # Pass parsed configuration to template
    display_data = {
        'id': display[0],
        'name': display[1],
        'description': display[2],
        'layout_config': layout_config,
        'background_config': background_config
    }
    
    return render_template('player.html', display=display, display_data=display_data)

@app.route('/api/display/<int:display_id>', methods=['GET', 'PUT', 'DELETE'])
@require_auth
def api_display(display_id):
    """API endpoint for display data."""
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    
    if request.method == 'GET':
        cursor.execute('SELECT * FROM displays WHERE id = ?', (display_id,))
        display = cursor.fetchone()
        conn.close()
        
        if not display:
            return jsonify({'error': 'Display not found'}), 404
        
        return jsonify({
            'id': display[0],
            'name': display[1],
            'description': display[2],
            'layout_config': json.loads(display[3]),
            'background_config': json.loads(display[4])
        })
    
    elif request.method == 'PUT':
        data = request.json
        layout_config = json.dumps(data.get('layout_config', {}))
        background_config = json.dumps(data.get('background_config', {}))
        
        cursor.execute('''
            UPDATE displays 
            SET name = ?, description = ?, layout_config = ?, background_config = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        ''', (data.get('name'), data.get('description'), layout_config, background_config, display_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    
    elif request.method == 'DELETE':
        # Check if display exists
        cursor.execute('SELECT id FROM displays WHERE id = ?', (display_id,))
        display = cursor.fetchone()
        
        if not display:
            conn.close()
            return jsonify({'success': False, 'message': 'Display not found'}), 404
        
        # Delete the display
        cursor.execute('DELETE FROM displays WHERE id = ?', (display_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Display deleted successfully'})

@app.route('/api/display', methods=['POST'])
@require_auth
def api_create_display():
    """Create new display."""
    data = request.json
    name = data.get('name', 'New Display')
    description = data.get('description', '')
    
    default_layout = json.dumps({
        'grid': {'rows': 2, 'cols': 2},
        'zones': [
            {
                'id': 0, 
                'type': 'clock', 
                'content': '', 
                'opacity': 1.0,
                'font_family': 'Arial, sans-serif',
                'font_size': '16px',
                'background': {'type': 'transparent'},
                'date_format': 'full',
                'time_format': '24h'
            },
            {
                'id': 1, 
                'type': 'iframe', 
                'content': '', 
                'opacity': 1.0,
                'font_family': 'Arial, sans-serif',
                'font_size': '16px',
                'background': {'type': 'transparent'}
            },
            {
                'id': 2, 
                'type': 'announcement', 
                'content': 'Welcome!', 
                'opacity': 1.0,
                'font_family': 'Arial, sans-serif',
                'font_size': '24px',
                'background': {'type': 'glassmorphism', 'blur': 10, 'opacity': 0.2}
            },
            {
                'id': 3, 
                'type': 'timer', 
                'content': '10', 
                'opacity': 1.0,
                'font_family': 'Arial, sans-serif',
                'font_size': '48px',
                'background': {'type': 'transparent'}
            }
        ],
        'global_font': 'Arial, sans-serif',
        'top_bar': {'mode': 'visible', 'show_seconds': True}
    })
    default_background = json.dumps({'type': 'color', 'value': '#1a1a1a'})

    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO displays (name, description, layout_config, background_config) 
        VALUES (?, ?, ?, ?)
    ''', (name, description, default_layout, default_background))
    
    display_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'display_id': display_id})

@app.route('/api/rss')
def api_rss():
    """Fetch RSS feed content."""
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL required'}), 400
    
    try:
        feed = feedparser.parse(url)
        items = []
        for entry in feed.entries[:10]:  # Limit to 10 items
            items.append({
                'title': entry.get('title', ''),
                'description': entry.get('description', ''),
                'link': entry.get('link', ''),
                'published': entry.get('published', '')
            })
        
        return jsonify({
            'title': feed.feed.get('title', ''),
            'items': items
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
@require_auth
def api_upload():
    """Upload background image."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Add timestamp to prevent conflicts
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_')
        filename = timestamp + filename
        
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        return jsonify({'success': True, 'filename': filename, 'url': f'/static/uploads/{filename}'})
    
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/api/time')
def api_time():
    """Get current time."""
    now = datetime.now()
    return jsonify({
        'time': now.strftime('%H:%M:%S'),
        'date': now.strftime('%A, %B %d, %Y'),
        'timestamp': now.timestamp()
    })

@app.route('/api/weather')
def api_weather():
    """Fetch weather data from Open-Meteo API."""
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    units = request.args.get('units', 'C')

    if not lat or not lon:
        return jsonify({'error': 'lat and lon parameters required'}), 400

    cache_key = f"{lat},{lon},{units}"
    now = time.time()
    if cache_key in _weather_cache:
        cached = _weather_cache[cache_key]
        if now - cached['timestamp'] < WEATHER_CACHE_TTL:
            return jsonify(cached['data'])

    try:
        temp_unit = 'fahrenheit' if units == 'F' else 'celsius'
        wind_unit = 'mph' if units == 'F' else 'kmh'
        params = urllib.parse.urlencode({
            'latitude': lat,
            'longitude': lon,
            'current': 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
            'daily': 'weather_code,temperature_2m_max,temperature_2m_min',
            'temperature_unit': temp_unit,
            'wind_speed_unit': wind_unit,
            'forecast_days': 3,
            'timezone': 'auto'
        })
        url = f'https://api.open-meteo.com/v1/forecast?{params}'
        req = urllib.request.Request(url, headers={'User-Agent': 'DigitalSignage/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        # Map WMO weather codes to conditions and emojis
        def weather_info(code):
            mapping = {
                0: ('Clear', '☀️'), 1: ('Mostly Clear', '🌤️'), 2: ('Partly Cloudy', '⛅'),
                3: ('Overcast', '☁️'), 45: ('Foggy', '🌫️'), 48: ('Foggy', '🌫️'),
                51: ('Light Drizzle', '🌦️'), 53: ('Drizzle', '🌦️'), 55: ('Heavy Drizzle', '🌧️'),
                61: ('Light Rain', '🌧️'), 63: ('Rain', '🌧️'), 65: ('Heavy Rain', '🌧️'),
                71: ('Light Snow', '🌨️'), 73: ('Snow', '🌨️'), 75: ('Heavy Snow', '❄️'),
                77: ('Snow Grains', '🌨️'), 80: ('Light Showers', '🌦️'), 81: ('Showers', '🌧️'),
                82: ('Heavy Showers', '🌧️'), 85: ('Snow Showers', '🌨️'), 86: ('Heavy Snow Showers', '❄️'),
                95: ('Thunderstorm', '⛈️'), 96: ('Thunderstorm + Hail', '⛈️'), 99: ('Thunderstorm + Hail', '⛈️')
            }
            return mapping.get(code, ('Unknown', '🌡️'))

        current = data.get('current', {})
        daily = data.get('daily', {})
        code = current.get('weather_code', 0)
        condition, emoji = weather_info(code)
        unit_symbol = '°F' if units == 'F' else '°C'
        wind_symbol = 'mph' if units == 'F' else 'km/h'

        result = {
            'current': {
                'temperature': current.get('temperature_2m'),
                'humidity': current.get('relative_humidity_2m'),
                'wind_speed': current.get('wind_speed_10m'),
                'weather_code': code,
                'condition': condition,
                'emoji': emoji,
                'unit': unit_symbol,
                'wind_unit': wind_symbol
            },
            'forecast': []
        }

        if daily.get('time'):
            for i in range(len(daily['time'])):
                fc_code = daily['weather_code'][i] if i < len(daily.get('weather_code', [])) else 0
                fc_cond, fc_emoji = weather_info(fc_code)
                result['forecast'].append({
                    'date': daily['time'][i],
                    'temp_max': daily['temperature_2m_max'][i] if i < len(daily.get('temperature_2m_max', [])) else None,
                    'temp_min': daily['temperature_2m_min'][i] if i < len(daily.get('temperature_2m_min', [])) else None,
                    'condition': fc_cond,
                    'emoji': fc_emoji
                })

        _weather_cache[cache_key] = {'data': result, 'timestamp': now}
        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/geocode')
def api_geocode():
    """Geocode a city name using Open-Meteo's geocoding API."""
    name = request.args.get('name')
    if not name:
        return jsonify({'error': 'name parameter required'}), 400

    try:
        params = urllib.parse.urlencode({'name': name, 'count': 5, 'language': 'en', 'format': 'json'})
        url = f'https://geocoding-api.open-meteo.com/v1/search?{params}'
        req = urllib.request.Request(url, headers={'User-Agent': 'DigitalSignage/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        results = []
        for r in data.get('results', []):
            results.append({
                'name': r.get('name'),
                'country': r.get('country', ''),
                'admin1': r.get('admin1', ''),
                'latitude': r.get('latitude'),
                'longitude': r.get('longitude')
            })

        return jsonify({'results': results})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/debug/<int:display_id>')
def debug_player(display_id):
    """Debug version of player to see what data is being passed."""
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM displays WHERE id = ?', (display_id,))
    display = cursor.fetchone()
    conn.close()
    
    if not display:
        return f"Display {display_id} not found", 404
    
    # Return raw data for debugging
    return f"""
    <html>
    <head><title>Debug Display {display_id}</title></head>
    <body style="color: white; background: black; font-family: monospace; padding: 20px;">
    <h1>Debug Display {display_id}</h1>
    <p><strong>ID:</strong> {display[0]}</p>
    <p><strong>Name:</strong> {display[1]}</p>
    <p><strong>Description:</strong> {display[2]}</p>
    <p><strong>Layout Config (raw):</strong></p>
    <pre>{display[3]}</pre>
    <p><strong>Background Config (raw):</strong></p>
    <pre>{display[4]}</pre>
    
    <h2>Parsed Layout:</h2>
    <pre>{json.dumps(json.loads(display[3]), indent=2)}</pre>
    
    <h2>Parsed Background:</h2>
    <pre>{json.dumps(json.loads(display[4]), indent=2)}</pre>
    
    <p><a href="/player/{display_id}" style="color: cyan;">Go to actual player</a></p>
    </body>
    </html>
    """

if __name__ == '__main__':
    init_database()
    print("Digital Signage Server Starting...")
    print("Access at: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
