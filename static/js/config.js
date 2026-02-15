// Configuration page functionality

let currentDisplayId = null;
let currentLayout = null;
let currentBackground = null;
let currentZoneId = null;

function initializeConfig(displayId, layoutConfig, backgroundConfig) {
    currentDisplayId = displayId;
    currentLayout = layoutConfig;
    currentBackground = backgroundConfig;
    
    // Set form values
    document.getElementById('gridRows').value = layoutConfig.grid.rows;
    document.getElementById('gridCols').value = layoutConfig.grid.cols;
    document.getElementById('globalFont').value = layoutConfig.global_font || 'Arial, sans-serif';

    // Set top bar settings
    const topBar = layoutConfig.top_bar || {mode: 'visible', show_seconds: true};
    currentLayout.top_bar = topBar;
    document.getElementById('topBarMode').value = topBar.mode;
    document.getElementById('topBarShowSeconds').checked = topBar.show_seconds !== false;

    // Set orientation
    document.getElementById('orientationMode').value = layoutConfig.orientation || 'landscape';
    
    // Set background
    if (backgroundConfig.type === 'color') {
        document.querySelector('input[name="bgType"][value="color"]').checked = true;
        document.getElementById('bgColor').value = backgroundConfig.value;
        showColorPicker();
    } else {
        document.querySelector('input[name="bgType"][value="image"]').checked = true;
        showImagePicker();
        if (backgroundConfig.value) {
            document.getElementById('currentImage').innerHTML = 
                `<img src="${backgroundConfig.value}" alt="Background" style="max-width: 200px; margin-top: 10px;">`;
        }
    }
    
    // Generate grid
    generateGrid();
    
    // Bind events
    bindEvents();
}

function bindEvents() {
    // Grid changes
    document.getElementById('gridRows').addEventListener('change', generateGrid);
    document.getElementById('gridCols').addEventListener('change', generateGrid);
    document.getElementById('globalFont').addEventListener('change', updateGlobalFont);

    // Top bar changes
    document.getElementById('topBarMode').addEventListener('change', updateTopBar);
    document.getElementById('topBarShowSeconds').addEventListener('change', updateTopBar);

    // Orientation change
    document.getElementById('orientationMode').addEventListener('change', function() {
        currentLayout.orientation = this.value;
        updateLivePreview();
    });

    // Background type changes
    document.querySelectorAll('input[name="bgType"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'color') {
                showColorPicker();
            } else {
                showImagePicker();
            }
            updateBackground();
        });
    });
    
    // Background value changes
    document.getElementById('bgColor').addEventListener('change', updateBackground);
    document.getElementById('bgImage').addEventListener('change', handleImageUpload);
    
    // Save button
    document.getElementById('saveBtn').addEventListener('click', saveConfiguration);
    
    // Zone type change
    document.getElementById('zoneType').addEventListener('change', updateZoneContentUI);
    
    // Zone background type changes
    document.querySelectorAll('input[name="zoneBgType"]').forEach(radio => {
        radio.addEventListener('change', updateZoneBackgroundUI);
    });
    
    // Opacity sliders
    document.getElementById('zoneOpacity').addEventListener('input', function() {
        document.getElementById('opacityValue').textContent = Math.round(this.value * 100) + '%';
    });
    
    document.getElementById('zoneBgOpacity')?.addEventListener('input', function() {
        document.getElementById('zoneBgOpacityValue').textContent = Math.round(this.value * 100) + '%';
    });
    
    document.getElementById('zoneGlassOpacity')?.addEventListener('input', function() {
        document.getElementById('zoneGlassOpacityValue').textContent = Math.round(this.value * 100) + '%';
    });
    
    document.getElementById('zoneBlur')?.addEventListener('input', function() {
        document.getElementById('zoneBlurValue').textContent = this.value + 'px';
    });
    
    // Zone background image upload
    document.getElementById('zoneBackgroundImage')?.addEventListener('change', handleZoneImageUpload);
}

function showColorPicker() {
    document.getElementById('colorPicker').style.display = 'block';
    document.getElementById('imagePicker').style.display = 'none';
}

function showImagePicker() {
    document.getElementById('colorPicker').style.display = 'none';
    document.getElementById('imagePicker').style.display = 'block';
}

function updateBackground() {
    const bgType = document.querySelector('input[name="bgType"]:checked').value;
    
    if (bgType === 'color') {
        currentBackground = {
            type: 'color',
            value: document.getElementById('bgColor').value
        };
    } else {
        currentBackground = {
            type: 'image',
            value: currentBackground.value || ''
        };
    }
    updateLivePreview();
}

async function handleImageUpload() {
    const file = document.getElementById('bgImage').files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentBackground.value = result.url;
            document.getElementById('currentImage').innerHTML = 
                `<img src="${result.url}" alt="Background" style="max-width: 200px; margin-top: 10px;">`;
        } else {
            alert('Upload failed: ' + result.error);
        }
    } catch (error) {
        alert('Upload error: ' + error.message);
    }
}

function generateGrid() {
    const rows = parseInt(document.getElementById('gridRows').value);
    const cols = parseInt(document.getElementById('gridCols').value);

    // Update layout config
    currentLayout.grid = { rows, cols };

    // Calculate how many zones fit based on spanning
    // Count occupied cells from existing zones
    const occupied = Array.from({ length: rows }, () => Array(cols).fill(false));
    let placedCount = 0;

    // First, try to place existing zones and count how many fit
    for (let i = 0; i < currentLayout.zones.length; i++) {
        const zone = currentLayout.zones[i];
        const colSpan = Math.min(zone.col_span || 1, cols);
        const rowSpan = Math.min(zone.row_span || 1, rows);
        let placed = false;

        for (let r = 0; r < rows && !placed; r++) {
            for (let c = 0; c < cols && !placed; c++) {
                if (occupied[r][c]) continue;
                if (r + rowSpan > rows || c + colSpan > cols) continue;
                let fits = true;
                for (let dr = 0; dr < rowSpan && fits; dr++) {
                    for (let dc = 0; dc < colSpan && fits; dc++) {
                        if (occupied[r + dr][c + dc]) fits = false;
                    }
                }
                if (fits) {
                    for (let dr = 0; dr < rowSpan; dr++) {
                        for (let dc = 0; dc < colSpan; dc++) {
                            occupied[r + dr][c + dc] = true;
                        }
                    }
                    placed = true;
                    placedCount++;
                }
            }
        }
        if (!placed) break;
    }

    // Count remaining empty cells and add zones for them
    let emptyCells = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!occupied[r][c]) emptyCells++;
        }
    }

    const neededZones = placedCount + emptyCells;
    while (currentLayout.zones.length < neededZones) {
        currentLayout.zones.push({
            id: currentLayout.zones.length,
            type: 'empty',
            content: '',
            opacity: 1.0,
            font_family: '',
            font_size: '16px',
            background: {type: 'transparent'},
            date_format: 'full',
            time_format: '24h'
        });
    }

    // Trim excess zones that don't fit
    if (currentLayout.zones.length > neededZones) {
        currentLayout.zones = currentLayout.zones.slice(0, neededZones);
    }

    // Generate grid HTML with occupancy-based placement
    const gridPreview = document.getElementById('gridPreview');
    gridPreview.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    gridPreview.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridPreview.innerHTML = '';

    const occupied2 = Array.from({ length: rows }, () => Array(cols).fill(false));

    currentLayout.zones.forEach((zone, i) => {
        const colSpan = Math.min(zone.col_span || 1, cols);
        const rowSpan = Math.min(zone.row_span || 1, rows);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (occupied2[r][c]) continue;
                if (r + rowSpan > rows || c + colSpan > cols) continue;
                let fits = true;
                for (let dr = 0; dr < rowSpan && fits; dr++) {
                    for (let dc = 0; dc < colSpan && fits; dc++) {
                        if (occupied2[r + dr][c + dc]) fits = false;
                    }
                }
                if (fits) {
                    for (let dr = 0; dr < rowSpan; dr++) {
                        for (let dc = 0; dc < colSpan; dc++) {
                            occupied2[r + dr][c + dc] = true;
                        }
                    }
                    const zoneElement = document.createElement('div');
                    zoneElement.className = `zone ${zone.type !== 'empty' ? 'configured' : ''}`;
                    zoneElement.style.opacity = zone.opacity;
                    zoneElement.style.gridColumn = `${c + 1} / span ${colSpan}`;
                    zoneElement.style.gridRow = `${r + 1} / span ${rowSpan}`;
                    const spanLabel = (colSpan > 1 || rowSpan > 1) ? ` <span style="font-size:0.7em; opacity:0.7;">(${colSpan}×${rowSpan})</span>` : '';
                    zoneElement.innerHTML = `
                        <div class="zone-label">Zone ${i + 1}${spanLabel}</div>
                        ${zone.type !== 'empty' ? `<div class="zone-type">${zone.type}</div>` : ''}
                    `;
                    zoneElement.addEventListener('click', () => openZoneModal(i));
                    gridPreview.appendChild(zoneElement);
                    return; // placed this zone, move to next
                }
            }
        }
    });
}

function openZoneModal(zoneId) {
    currentZoneId = zoneId;
    const zone = currentLayout.zones[zoneId];
    
    document.getElementById('zoneNumber').textContent = zoneId + 1;
    document.getElementById('zoneType').value = zone.type;
    document.getElementById('zoneContent').value = zone.content;
    document.getElementById('zoneOpacity').value = zone.opacity;
    document.getElementById('opacityValue').textContent = Math.round(zone.opacity * 100) + '%';
    
    // Set spanning
    document.getElementById('zoneColSpan').value = zone.col_span || 1;
    document.getElementById('zoneRowSpan').value = zone.row_span || 1;
    // Update max span values based on grid dimensions
    document.getElementById('zoneColSpan').max = currentLayout.grid.cols;
    document.getElementById('zoneRowSpan').max = currentLayout.grid.rows;

    // Set typography
    document.getElementById('zoneFontFamily').value = zone.font_family || '';
    document.getElementById('zoneFontSize').value = zone.font_size || '16px';
    
    // Set clock settings
    if (zone.time_format) {
        document.getElementById('timeFormat').value = zone.time_format;
    }
    if (zone.date_format) {
        document.getElementById('dateFormat').value = zone.date_format;
    }
    
    // Set announcement settings
    document.getElementById('announcementMode').value = zone.announcement_mode || 'static';
    document.getElementById('announcementInterval').value = zone.announcement_interval || 5;

    // Set RSS settings
    document.getElementById('rssMode').value = zone.rss_mode || 'list';
    document.getElementById('rssInterval').value = zone.rss_interval || 5;

    // Populate schedule entries
    const scheduleContainer = document.getElementById('scheduleEntries');
    scheduleContainer.innerHTML = '';
    if (zone.schedule && Array.isArray(zone.schedule)) {
        zone.schedule.forEach(entry => addScheduleEntry(entry));
    }

    // Set weather settings
    document.getElementById('weatherLocation').value = zone.weather_location || '';
    document.getElementById('weatherUnits').value = zone.weather_units || 'C';
    document.getElementById('weatherRefresh').value = zone.weather_refresh || 30;
    document.getElementById('weatherLat').value = zone.weather_lat || '';
    document.getElementById('weatherLon').value = zone.weather_lon || '';

    // Set background
    const bg = zone.background || {type: 'transparent'};
    document.querySelector(`input[name="zoneBgType"][value="${bg.type}"]`).checked = true;
    
    if (bg.type === 'color') {
        document.getElementById('zoneBackgroundColor').value = bg.color || '#000000';
        document.getElementById('zoneBgOpacity').value = bg.opacity || 0.8;
        document.getElementById('zoneBgOpacityValue').textContent = Math.round((bg.opacity || 0.8) * 100) + '%';
    } else if (bg.type === 'glassmorphism') {
        document.getElementById('zoneBlur').value = bg.blur || 10;
        document.getElementById('zoneBlurValue').textContent = (bg.blur || 10) + 'px';
        document.getElementById('zoneGlassOpacity').value = bg.opacity || 0.2;
        document.getElementById('zoneGlassOpacityValue').textContent = Math.round((bg.opacity || 0.2) * 100) + '%';
    } else if (bg.type === 'image' && bg.url) {
        document.getElementById('currentZoneImage').innerHTML = 
            `<img src="${bg.url}" alt="Zone Background" style="max-width: 200px; margin-top: 10px;">`;
    }
    
    updateZoneContentUI();
    updateZoneBackgroundUI();
    document.getElementById('zoneModal').style.display = 'flex';
}

function closeZoneModal() {
    document.getElementById('zoneModal').style.display = 'none';
}

function updateZoneContentUI() {
    const zoneType = document.getElementById('zoneType').value;
    const contentGroup = document.getElementById('zoneContentGroup');
    const contentLabel = document.getElementById('zoneContentLabel');
    const contentHelp = document.getElementById('contentHelp');
    const clockSettings = document.getElementById('clockSettings');

    const announcementSettings = document.getElementById('announcementSettings');
    const rssSettings = document.getElementById('rssSettings');
    const weatherSettings = document.getElementById('weatherSettings');
    const scheduleSettings = document.getElementById('scheduleSettings');

    // Hide all type-specific settings by default
    clockSettings.style.display = 'none';
    announcementSettings.style.display = 'none';
    rssSettings.style.display = 'none';
    weatherSettings.style.display = 'none';
    scheduleSettings.style.display = 'none';

    // Show schedule for content types where it makes sense
    const schedulableTypes = ['announcement', 'image', 'video', 'slideshow', 'iframe', 'rss'];
    if (schedulableTypes.includes(zoneType)) {
        scheduleSettings.style.display = 'block';
    }

    switch (zoneType) {
        case 'empty':
            contentGroup.style.display = 'none';
            break;
        case 'clock':
            contentGroup.style.display = 'none';
            clockSettings.style.display = 'block';
            break;
        case 'timer':
            contentGroup.style.display = 'block';
            contentLabel.textContent = 'Timer Duration (minutes)';
            contentHelp.textContent = 'Enter the number of minutes for the countdown timer';
            break;
        case 'announcement':
            contentGroup.style.display = 'block';
            contentLabel.textContent = 'Announcement Text';
            contentHelp.textContent = 'Enter the text to display. Use separate lines for multiple announcements (crossfade/marquee modes).';
            announcementSettings.style.display = 'block';
            break;
        case 'iframe':
            contentGroup.style.display = 'block';
            contentLabel.textContent = 'iframe Embed Code or URL';
            contentHelp.textContent = 'Enter the full iframe HTML code or just a URL';
            break;
        case 'rss':
            contentGroup.style.display = 'block';
            contentLabel.textContent = 'RSS Feed URL';
            contentHelp.textContent = 'Enter the URL of the RSS feed to display';
            rssSettings.style.display = 'block';
            break;
        case 'image':
            contentGroup.style.display = 'block';
            contentLabel.textContent = 'Image URL';
            contentHelp.textContent = 'Enter the URL of the image to display (or upload via global background and use that URL)';
            break;
        case 'video':
            contentGroup.style.display = 'block';
            contentLabel.textContent = 'Video URL';
            contentHelp.textContent = 'Enter the URL of the video to display (MP4, WebM, etc.) or YouTube URL';
            break;
        case 'slideshow':
            contentGroup.style.display = 'block';
            contentLabel.textContent = 'Slideshow Configuration';
            contentHelp.textContent = 'Format: "timer_seconds:image1.jpg" or just list images. First line can be "8:" to set 8-second timer. Example:\n8:\nimage1.jpg\nimage2.jpg\nOr:\n3:first image.jpg\nsecond image.jpg';
            break;
        case 'weather':
            contentGroup.style.display = 'none';
            weatherSettings.style.display = 'block';
            break;
    }
}

// Zone form submission
document.getElementById('zoneForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const zone = currentLayout.zones[currentZoneId];
    zone.type = document.getElementById('zoneType').value;
    zone.content = document.getElementById('zoneContent').value;
    zone.opacity = parseFloat(document.getElementById('zoneOpacity').value);
    
    // Spanning
    zone.col_span = parseInt(document.getElementById('zoneColSpan').value) || 1;
    zone.row_span = parseInt(document.getElementById('zoneRowSpan').value) || 1;

    // Typography
    zone.font_family = document.getElementById('zoneFontFamily').value;
    zone.font_size = document.getElementById('zoneFontSize').value;
    
    // Clock settings
    if (zone.type === 'clock') {
        zone.time_format = document.getElementById('timeFormat').value;
        zone.date_format = document.getElementById('dateFormat').value;
    }

    // Announcement settings
    if (zone.type === 'announcement') {
        zone.announcement_mode = document.getElementById('announcementMode').value;
        zone.announcement_interval = parseInt(document.getElementById('announcementInterval').value) || 5;
    }

    // RSS settings
    if (zone.type === 'rss') {
        zone.rss_mode = document.getElementById('rssMode').value;
        zone.rss_interval = parseInt(document.getElementById('rssInterval').value) || 5;
    }

    // Schedule
    const schedulableTypes = ['announcement', 'image', 'video', 'slideshow', 'iframe', 'rss'];
    if (schedulableTypes.includes(zone.type)) {
        const scheduleEntries = collectScheduleEntries();
        zone.schedule = scheduleEntries.length > 0 ? scheduleEntries : undefined;
    }

    // Weather settings
    if (zone.type === 'weather') {
        zone.weather_location = document.getElementById('weatherLocation').value;
        zone.weather_units = document.getElementById('weatherUnits').value;
        zone.weather_refresh = parseInt(document.getElementById('weatherRefresh').value) || 30;
        zone.weather_lat = document.getElementById('weatherLat').value;
        zone.weather_lon = document.getElementById('weatherLon').value;
    }

    // Background
    const bgType = document.querySelector('input[name="zoneBgType"]:checked').value;
    zone.background = {type: bgType};
    
    switch (bgType) {
        case 'color':
            zone.background.color = document.getElementById('zoneBackgroundColor').value;
            zone.background.opacity = parseFloat(document.getElementById('zoneBgOpacity').value);
            break;
        case 'glassmorphism':
            zone.background.blur = parseInt(document.getElementById('zoneBlur').value);
            zone.background.opacity = parseFloat(document.getElementById('zoneGlassOpacity').value);
            break;
        case 'image':
            const imageUrl = document.getElementById('zoneBackgroundImage').dataset.url;
            if (imageUrl) {
                zone.background.url = imageUrl;
            }
            break;
    }
    
    closeZoneModal();
    generateGrid();
    updateLivePreview();
});

// ─── Live Preview ─────────────────────────────────────────────

let _previewDebounceTimer = null;

function updateLivePreview() {
    clearTimeout(_previewDebounceTimer);
    _previewDebounceTimer = setTimeout(() => {
        const iframe = document.getElementById('livePreview');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'configUpdate',
                layout: currentLayout,
                background: currentBackground
            }, '*');
        }
    }, 500);
}

function refreshPreview() {
    const iframe = document.getElementById('livePreview');
    if (iframe) {
        iframe.src = iframe.src;
    }
}

async function saveConfiguration() {
    const displayName = document.getElementById('displayName').value;
    const displayDescription = document.getElementById('displayDescription').value;
    
    try {
        await signageApp.request(`/api/display/${currentDisplayId}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: displayName,
                description: displayDescription,
                layout_config: currentLayout,
                background_config: currentBackground
            })
        });

        alert('Configuration saved! Update will be pushed to display within 30 seconds.');
    } catch (error) {
        alert('Error saving configuration: ' + error.message);
    }
}

function updateGlobalFont() {
    const globalFont = document.getElementById('globalFont').value;
    currentLayout.global_font = globalFont;
    updateLivePreview();
}

function updateTopBar() {
    currentLayout.top_bar = {
        mode: document.getElementById('topBarMode').value,
        show_seconds: document.getElementById('topBarShowSeconds').checked
    };
    updateLivePreview();
}

function updateZoneBackgroundUI() {
    const bgType = document.querySelector('input[name="zoneBgType"]:checked').value;
    
    // Hide all background options
    document.getElementById('zoneBgColor').style.display = 'none';
    document.getElementById('zoneBgGlass').style.display = 'none';
    document.getElementById('zoneBgImage').style.display = 'none';
    
    // Show relevant options
    switch (bgType) {
        case 'color':
            document.getElementById('zoneBgColor').style.display = 'block';
            break;
        case 'glassmorphism':
            document.getElementById('zoneBgGlass').style.display = 'block';
            break;
        case 'image':
            document.getElementById('zoneBgImage').style.display = 'block';
            break;
    }
}

// ─── Schedule Management ──────────────────────────────────────

function addScheduleEntry(entry = null) {
    const container = document.getElementById('scheduleEntries');
    const idx = container.children.length;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const div = document.createElement('div');
    div.className = 'schedule-entry';
    div.style.cssText = 'padding: 0.75rem; margin-bottom: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--background-secondary);';

    let daysHtml = dayNames.map((d, i) => {
        const checked = entry && entry.days && entry.days.includes(i) ? 'checked' : '';
        return `<label style="display:inline-flex;align-items:center;gap:2px;font-size:0.75rem;font-weight:normal;"><input type="checkbox" class="schedule-day" value="${i}" ${checked}>${d}</label>`;
    }).join(' ');

    div.innerHTML = `
        <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.5rem;">
            <input type="text" class="schedule-label" placeholder="Label" value="${entry ? (entry.label || '') : ''}" style="flex:1;padding:0.375rem;">
            <input type="time" class="schedule-start" value="${entry ? (entry.time_start || '') : ''}" style="padding:0.375rem;">
            <span>to</span>
            <input type="time" class="schedule-end" value="${entry ? (entry.time_end || '') : ''}" style="padding:0.375rem;">
            <button type="button" class="btn btn-danger" onclick="this.closest('.schedule-entry').remove()" style="padding:0.375rem 0.5rem;min-height:auto;min-width:auto;">
                <i class="material-icons" style="font-size:1rem;margin:0;">close</i>
            </button>
        </div>
        <div style="margin-bottom:0.5rem;display:flex;gap:0.5rem;flex-wrap:wrap;">${daysHtml}</div>
        <textarea class="schedule-content" rows="2" placeholder="Override content..." style="width:100%;padding:0.375rem;font-size:0.8rem;">${entry ? (entry.content || '') : ''}</textarea>
    `;

    container.appendChild(div);
}

function collectScheduleEntries() {
    const entries = [];
    document.querySelectorAll('.schedule-entry').forEach(div => {
        const days = [];
        div.querySelectorAll('.schedule-day:checked').forEach(cb => days.push(parseInt(cb.value)));
        entries.push({
            label: div.querySelector('.schedule-label').value,
            time_start: div.querySelector('.schedule-start').value,
            time_end: div.querySelector('.schedule-end').value,
            days: days,
            content: div.querySelector('.schedule-content').value
        });
    });
    return entries;
}

async function searchWeatherLocation() {
    const locationInput = document.getElementById('weatherLocation');
    const name = locationInput.value.trim();
    if (!name) return;

    try {
        const response = await fetch(`/api/geocode?name=${encodeURIComponent(name)}`);
        const data = await response.json();

        if (data.error) {
            alert('Geocode error: ' + data.error);
            return;
        }

        if (!data.results || data.results.length === 0) {
            alert('No locations found for "' + name + '"');
            return;
        }

        // Use first result, or let user pick if multiple
        const r = data.results[0];
        document.getElementById('weatherLat').value = r.latitude;
        document.getElementById('weatherLon').value = r.longitude;
        const displayName = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
        locationInput.value = displayName;
    } catch (error) {
        alert('Search error: ' + error.message);
    }
}

async function handleZoneImageUpload() {
    const file = document.getElementById('zoneBackgroundImage').files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('currentZoneImage').innerHTML = 
                `<img src="${result.url}" alt="Zone Background" style="max-width: 200px; margin-top: 10px;">`;
            // Store the URL for when we save the zone
            document.getElementById('zoneBackgroundImage').dataset.url = result.url;
        } else {
            alert('Upload failed: ' + result.error);
        }
    } catch (error) {
        alert('Upload error: ' + error.message);
    }
}
