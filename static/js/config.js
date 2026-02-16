// ─── Config Page — Figma-style Inline Editing ────────────────

/* ── State ──────────────────────────────────────────────────── */
const S = {
    displayId: null,
    layout: null,
    background: null,
    description: '',
    selectedZone: null,   // null = global, number = zone index
    activeTab: 'content', // content | style | schedule
    mergeMode: false,
    mergeSelection: new Set(),
    dirty: false,
    zonePositionMap: [],  // [{r,c,rowSpan,colSpan}, ...]
};

/* ── Font Options (shared between global & zone selects) ───── */
const FONT_OPTIONS = `
<optgroup label="Modern Sans-Serif">
    <option value="Inter, sans-serif">Inter</option>
    <option value="'Work Sans', sans-serif">Work Sans</option>
    <option value="Manrope, sans-serif">Manrope</option>
    <option value="'Space Grotesk', sans-serif">Space Grotesk</option>
    <option value="'IBM Plex Sans', sans-serif">IBM Plex Sans</option>
    <option value="Rubik, sans-serif">Rubik</option>
    <option value="'DM Sans', sans-serif">DM Sans</option>
    <option value="'Plus Jakarta Sans', sans-serif">Plus Jakarta Sans</option>
    <option value="Outfit, sans-serif">Outfit</option>
    <option value="Lexend, sans-serif">Lexend</option>
    <option value="Sora, sans-serif">Sora</option>
</optgroup>
<optgroup label="Popular Sans-Serif">
    <option value="Roboto, sans-serif">Roboto</option>
    <option value="'Open Sans', sans-serif">Open Sans</option>
    <option value="Lato, sans-serif">Lato</option>
    <option value="Montserrat, sans-serif">Montserrat</option>
    <option value="Poppins, sans-serif">Poppins</option>
    <option value="'Source Sans Pro', sans-serif">Source Sans Pro</option>
    <option value="Ubuntu, sans-serif">Ubuntu</option>
    <option value="Nunito, sans-serif">Nunito</option>
    <option value="Raleway, sans-serif">Raleway</option>
    <option value="'PT Sans', sans-serif">PT Sans</option>
    <option value="Oswald, sans-serif">Oswald</option>
    <option value="'Fira Sans', sans-serif">Fira Sans</option>
    <option value="Barlow, sans-serif">Barlow</option>
    <option value="Quicksand, sans-serif">Quicksand</option>
    <option value="Karla, sans-serif">Karla</option>
    <option value="Mulish, sans-serif">Mulish</option>
    <option value="'Red Hat Display', sans-serif">Red Hat Display</option>
</optgroup>
<optgroup label="Serif Fonts">
    <option value="'Playfair Display', serif">Playfair Display</option>
    <option value="Merriweather, serif">Merriweather</option>
    <option value="'Roboto Slab', serif">Roboto Slab</option>
</optgroup>
<optgroup label="System Fonts">
    <option value="Arial, sans-serif">Arial</option>
    <option value="'Times New Roman', serif">Times New Roman</option>
    <option value="'Courier New', monospace">Courier New</option>
    <option value="Georgia, serif">Georgia</option>
    <option value="Verdana, sans-serif">Verdana</option>
    <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
    <option value="'Lucida Console', monospace">Lucida Console</option>
    <option value="Impact, sans-serif">Impact</option>
    <option value="'Comic Sans MS', cursive">Comic Sans MS</option>
</optgroup>`;

/* ── Zone Type Definitions ──────────────────────────────────── */
const ZONE_TYPES = [
    { value: 'empty',        icon: 'check_box_outline_blank', label: 'Empty' },
    { value: 'clock',        icon: 'schedule',                label: 'Clock' },
    { value: 'timer',        icon: 'timer',                   label: 'Timer' },
    { value: 'announcement', icon: 'campaign',                label: 'Announce' },
    { value: 'weather',      icon: 'cloud',                   label: 'Weather' },
    { value: 'rss',          icon: 'rss_feed',                label: 'RSS' },
    { value: 'image',        icon: 'image',                   label: 'Image' },
    { value: 'video',        icon: 'videocam',                label: 'Video' },
    { value: 'slideshow',    icon: 'slideshow',               label: 'Slideshow' },
    { value: 'iframe',       icon: 'web',                     label: 'iFrame' },
];

/* ── Init ───────────────────────────────────────────────────── */
function initConfigPage(id, layout, bg, description) {
    S.displayId = id;
    S.layout = layout;
    S.background = bg;
    S.description = description || '';

    // Ensure defaults
    S.layout.top_bar = S.layout.top_bar || { mode: 'visible', show_seconds: true, font_weight: '700' };
    S.layout.orientation = S.layout.orientation || 'landscape';
    S.layout.global_font = S.layout.global_font || 'Arial, sans-serif';

    // Set grid toolbar values
    document.getElementById('gridRows').value = layout.grid.rows;
    document.getElementById('gridCols').value = layout.grid.cols;

    // Bind toolbar events
    document.getElementById('gridRows').addEventListener('change', () => { onGridChange(); });
    document.getElementById('gridCols').addEventListener('change', () => { onGridChange(); });

    // Click outside grid to deselect
    document.querySelector('.grid-canvas').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) deselectZone();
    });

    // Unsaved changes warning
    window.addEventListener('beforeunload', (e) => {
        if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    renderGrid();
    renderPanel();
}

/* ── Dirty Flag ─────────────────────────────────────────────── */
function markDirty() {
    S.dirty = true;
    const btn = document.getElementById('saveBtn');
    btn.classList.add('save-pulse');
}

/* ── Toast ──────────────────────────────────────────────────── */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="material-icons">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</i> ${message}`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* ── Grid Rendering ─────────────────────────────────────────── */
function onGridChange() {
    const rows = parseInt(document.getElementById('gridRows').value);
    const cols = parseInt(document.getElementById('gridCols').value);
    S.layout.grid = { rows, cols };
    reconcileZones();
    renderGrid();
    renderPanel();
    markDirty();
    updateLivePreview();
}

function reconcileZones() {
    const { rows, cols } = S.layout.grid;
    const occupied = Array.from({ length: rows }, () => Array(cols).fill(false));
    let placedCount = 0;

    for (let i = 0; i < S.layout.zones.length; i++) {
        const zone = S.layout.zones[i];
        const colSpan = Math.min(zone.col_span || 1, cols);
        const rowSpan = Math.min(zone.row_span || 1, rows);
        let placed = false;
        for (let r = 0; r < rows && !placed; r++) {
            for (let c = 0; c < cols && !placed; c++) {
                if (occupied[r][c]) continue;
                if (r + rowSpan > rows || c + colSpan > cols) continue;
                let fits = true;
                for (let dr = 0; dr < rowSpan && fits; dr++)
                    for (let dc = 0; dc < colSpan && fits; dc++)
                        if (occupied[r + dr][c + dc]) fits = false;
                if (fits) {
                    for (let dr = 0; dr < rowSpan; dr++)
                        for (let dc = 0; dc < colSpan; dc++)
                            occupied[r + dr][c + dc] = true;
                    placed = true;
                    placedCount++;
                }
            }
        }
        if (!placed) break;
    }

    let emptyCells = 0;
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            if (!occupied[r][c]) emptyCells++;

    const needed = placedCount + emptyCells;
    while (S.layout.zones.length < needed) {
        S.layout.zones.push(makeEmptyZone(S.layout.zones.length));
    }
    if (S.layout.zones.length > needed) {
        S.layout.zones = S.layout.zones.slice(0, needed);
    }

    // If selected zone no longer exists, deselect
    if (S.selectedZone !== null && S.selectedZone >= S.layout.zones.length) {
        S.selectedZone = null;
    }
}

function makeEmptyZone(id) {
    return {
        id, type: 'empty', content: '', opacity: 1.0,
        font_family: '', font_size: '16px',
        background: { type: 'transparent' },
        date_format: 'full', time_format: '24h'
    };
}

function renderGrid() {
    const { rows, cols } = S.layout.grid;
    const grid = document.getElementById('gridPreview');
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.innerHTML = '';
    S.zonePositionMap = [];

    const occupied = Array.from({ length: rows }, () => Array(cols).fill(false));

    S.layout.zones.forEach((zone, i) => {
        const colSpan = Math.min(zone.col_span || 1, cols);
        const rowSpan = Math.min(zone.row_span || 1, rows);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (occupied[r][c]) continue;
                if (r + rowSpan > rows || c + colSpan > cols) continue;
                let fits = true;
                for (let dr = 0; dr < rowSpan && fits; dr++)
                    for (let dc = 0; dc < colSpan && fits; dc++)
                        if (occupied[r + dr][c + dc]) fits = false;
                if (!fits) continue;

                for (let dr = 0; dr < rowSpan; dr++)
                    for (let dc = 0; dc < colSpan; dc++)
                        occupied[r + dr][c + dc] = true;

                S.zonePositionMap[i] = { r, c, rowSpan, colSpan };

                const el = document.createElement('div');
                const isMerged = colSpan > 1 || rowSpan > 1;
                const isSelected = S.selectedZone === i;
                const isMergeSelected = S.mergeMode && S.mergeSelection.has(i);

                let cls = 'grid-zone';
                if (zone.type !== 'empty') cls += ' configured';
                if (isSelected) cls += ' selected';
                if (S.mergeMode) cls += ' merge-mode';
                if (isMergeSelected) cls += ' merge-selected';
                el.className = cls;

                el.style.gridColumn = `${c + 1} / span ${colSpan}`;
                el.style.gridRow = `${r + 1} / span ${rowSpan}`;

                const spanLabel = isMerged ? ` <span class="zone-span-badge">${colSpan}&times;${rowSpan}</span>` : '';
                const typeBadge = zone.type !== 'empty' ? `<span class="zone-type-badge">${zone.type}</span>` : '';
                const splitBtn = isMerged && !S.mergeMode
                    ? `<button class="zone-action-btn" onclick="event.stopPropagation(); splitZone(${i})" title="Split"><i class="material-icons">grid_view</i></button>`
                    : '';

                el.innerHTML = `
                    ${typeBadge}
                    <div class="zone-actions">${splitBtn}</div>
                    <div class="zone-label">Zone ${i + 1}${spanLabel}</div>
                `;

                if (S.mergeMode) {
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (S.mergeSelection.has(i)) S.mergeSelection.delete(i);
                        else S.mergeSelection.add(i);
                        renderGrid();
                    });
                } else {
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        selectZone(i);
                    });
                }

                grid.appendChild(el);
                return; // placed, next zone
            }
        }
    });
}

/* ── Selection ──────────────────────────────────────────────── */
function selectZone(i) {
    S.selectedZone = i;
    S.activeTab = 'content';
    renderGrid();
    renderPanel();
}

function deselectZone() {
    if (S.selectedZone === null) return;
    S.selectedZone = null;
    renderGrid();
    renderPanel();
}

/* ── Panel Rendering ────────────────────────────────────────── */
function renderPanel() {
    const panel = document.getElementById('panelContent');
    if (S.selectedZone !== null) {
        panel.innerHTML = renderZonePanel(S.selectedZone);
        bindZonePanelEvents(S.selectedZone);
    } else {
        panel.innerHTML = renderGlobalPanel();
        bindGlobalPanelEvents();
    }
}

/* ── Global Panel (accordion sections) ──────────────────────── */
function renderGlobalPanel() {
    const bg = S.background;
    const tb = S.layout.top_bar;

    const bgTypeChecked = (t) => bg.type === t ? 'checked' : '';

    return `
    <div class="panel-header">
        <h3>Display Settings</h3>
        <p class="panel-subtitle">Global configuration</p>
    </div>
    <div class="panel-body">
        <!-- Display Info -->
        <div class="accordion-section open">
            <button class="accordion-header" onclick="toggleAccordion(this)">
                <i class="material-icons">info</i>
                <span>Display Info</span>
                <i class="material-icons accordion-chevron">expand_more</i>
            </button>
            <div class="accordion-content">
                <div class="form-field">
                    <label>Description</label>
                    <textarea id="panelDescription" rows="2">${escHtml(S.description)}</textarea>
                </div>
            </div>
        </div>

        <!-- Appearance / Background -->
        <div class="accordion-section open">
            <button class="accordion-header" onclick="toggleAccordion(this)">
                <i class="material-icons">palette</i>
                <span>Background</span>
                <i class="material-icons accordion-chevron">expand_more</i>
            </button>
            <div class="accordion-content">
                <div class="form-field">
                    <label>Type</label>
                    <div class="option-cards" id="bgTypeCards">
                        <label class="option-card ${bg.type === 'color' ? 'active' : ''}">
                            <input type="radio" name="bgType" value="color" ${bgTypeChecked('color')}> Color
                        </label>
                        <label class="option-card ${bg.type === 'gradient' ? 'active' : ''}">
                            <input type="radio" name="bgType" value="gradient" ${bgTypeChecked('gradient')}> Gradient
                        </label>
                        <label class="option-card ${bg.type === 'image' ? 'active' : ''}">
                            <input type="radio" name="bgType" value="image" ${bgTypeChecked('image')}> Image
                        </label>
                    </div>
                </div>
                <div id="bgColorField" class="form-field" style="display:${bg.type === 'color' ? 'block' : 'none'}">
                    <label>Color</label>
                    <input type="color" id="bgColor" value="${bg.type === 'color' ? (bg.value || '#1a1a1a') : '#1a1a1a'}">
                </div>
                <div id="bgGradientField" class="form-field" style="display:${bg.type === 'gradient' ? 'block' : 'none'}">
                    <label>CSS Gradient</label>
                    <input type="text" id="bgGradient" value="${escHtml(bg.type === 'gradient' ? (bg.value || '') : 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)')}" placeholder="linear-gradient(...)">
                    <div id="gradientPreview" class="gradient-preview" style="background:${bg.type === 'gradient' ? bg.value : ''}"></div>
                </div>
                <div id="bgImageField" class="form-field" style="display:${bg.type === 'image' ? 'block' : 'none'}">
                    <label>Upload Image</label>
                    <input type="file" id="bgImage" accept="image/*">
                    <div id="currentImage">${bg.type === 'image' && bg.value ? `<img src="${bg.value}" alt="Background" style="max-width:100%;margin-top:0.5rem;border-radius:var(--radius-sm);">` : ''}</div>
                </div>
            </div>
        </div>

        <!-- Typography -->
        <div class="accordion-section open">
            <button class="accordion-header" onclick="toggleAccordion(this)">
                <i class="material-icons">text_fields</i>
                <span>Typography</span>
                <i class="material-icons accordion-chevron">expand_more</i>
            </button>
            <div class="accordion-content">
                <div class="form-field">
                    <label>Global Font</label>
                    <select id="globalFont">${FONT_OPTIONS}</select>
                </div>
            </div>
        </div>

        <!-- Top Bar -->
        <div class="accordion-section">
            <button class="accordion-header" onclick="toggleAccordion(this)">
                <i class="material-icons">web_asset</i>
                <span>Top Bar</span>
                <i class="material-icons accordion-chevron">expand_more</i>
            </button>
            <div class="accordion-content">
                <div class="form-field">
                    <label>Mode</label>
                    <select id="topBarMode">
                        <option value="visible" ${tb.mode === 'visible' ? 'selected' : ''}>Always Visible</option>
                        <option value="overlay" ${tb.mode === 'overlay' ? 'selected' : ''}>Overlay (transparent)</option>
                        <option value="auto-hide" ${tb.mode === 'auto-hide' ? 'selected' : ''}>Auto-Hide</option>
                        <option value="hidden" ${tb.mode === 'hidden' ? 'selected' : ''}>Hidden</option>
                    </select>
                </div>
                <div class="form-field">
                    <label><input type="checkbox" id="topBarShowSeconds" ${tb.show_seconds !== false ? 'checked' : ''}> Show seconds in clock</label>
                </div>
                <div class="form-field">
                    <label>Font Weight</label>
                    <select id="topBarFontWeight">
                        <option value="200" ${tb.font_weight === '200' ? 'selected' : ''}>Thin (200)</option>
                        <option value="300" ${tb.font_weight === '300' ? 'selected' : ''}>Light (300)</option>
                        <option value="400" ${tb.font_weight === '400' ? 'selected' : ''}>Regular (400)</option>
                        <option value="500" ${tb.font_weight === '500' ? 'selected' : ''}>Medium (500)</option>
                        <option value="600" ${tb.font_weight === '600' ? 'selected' : ''}>Semi-Bold (600)</option>
                        <option value="700" ${(tb.font_weight || '700') === '700' ? 'selected' : ''}>Bold (700)</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Layout / Orientation -->
        <div class="accordion-section">
            <button class="accordion-header" onclick="toggleAccordion(this)">
                <i class="material-icons">screen_rotation</i>
                <span>Orientation</span>
                <i class="material-icons accordion-chevron">expand_more</i>
            </button>
            <div class="accordion-content">
                <div class="form-field">
                    <label>Screen Orientation</label>
                    <select id="orientationMode">
                        <option value="landscape" ${S.layout.orientation === 'landscape' ? 'selected' : ''}>Landscape</option>
                        <option value="portrait" ${S.layout.orientation === 'portrait' ? 'selected' : ''}>Portrait</option>
                        <option value="auto" ${S.layout.orientation === 'auto' ? 'selected' : ''}>Auto (detect)</option>
                    </select>
                </div>
            </div>
        </div>
    </div>`;
}

function bindGlobalPanelEvents() {
    // Description
    const desc = document.getElementById('panelDescription');
    if (desc) desc.addEventListener('input', () => { S.description = desc.value; markDirty(); });

    // Background type
    document.querySelectorAll('#bgTypeCards input[name="bgType"]').forEach(radio => {
        radio.addEventListener('change', function () {
            document.querySelectorAll('#bgTypeCards .option-card').forEach(c => c.classList.remove('active'));
            this.closest('.option-card').classList.add('active');
            const v = this.value;
            document.getElementById('bgColorField').style.display = v === 'color' ? 'block' : 'none';
            document.getElementById('bgGradientField').style.display = v === 'gradient' ? 'block' : 'none';
            document.getElementById('bgImageField').style.display = v === 'image' ? 'block' : 'none';
            updateBackground();
        });
    });

    // Background color
    const bgColor = document.getElementById('bgColor');
    if (bgColor) bgColor.addEventListener('input', updateBackground);

    // Background gradient
    const bgGrad = document.getElementById('bgGradient');
    if (bgGrad) bgGrad.addEventListener('input', () => {
        const preview = document.getElementById('gradientPreview');
        if (preview) preview.style.background = bgGrad.value;
        updateBackground();
    });

    // Background image upload
    const bgImg = document.getElementById('bgImage');
    if (bgImg) bgImg.addEventListener('change', handleImageUpload);

    // Global font
    const gf = document.getElementById('globalFont');
    if (gf) {
        gf.value = S.layout.global_font;
        gf.addEventListener('change', () => {
            S.layout.global_font = gf.value;
            markDirty();
            updateLivePreview();
        });
    }

    // Top bar
    const tbMode = document.getElementById('topBarMode');
    const tbSec = document.getElementById('topBarShowSeconds');
    const tbWeight = document.getElementById('topBarFontWeight');
    const updateTb = () => {
        S.layout.top_bar = {
            mode: tbMode.value,
            show_seconds: tbSec.checked,
            font_weight: tbWeight.value
        };
        markDirty();
        updateLivePreview();
    };
    if (tbMode) tbMode.addEventListener('change', updateTb);
    if (tbSec) tbSec.addEventListener('change', updateTb);
    if (tbWeight) tbWeight.addEventListener('change', updateTb);

    // Orientation
    const orient = document.getElementById('orientationMode');
    if (orient) orient.addEventListener('change', () => {
        S.layout.orientation = orient.value;
        markDirty();
        updateLivePreview();
    });
}

function updateBackground() {
    const checked = document.querySelector('#bgTypeCards input[name="bgType"]:checked');
    if (!checked) return;
    const bgType = checked.value;

    if (bgType === 'color') {
        S.background = { type: 'color', value: document.getElementById('bgColor').value };
    } else if (bgType === 'gradient') {
        S.background = { type: 'gradient', value: document.getElementById('bgGradient').value };
    } else {
        S.background = { type: 'image', value: S.background.value || '' };
    }
    markDirty();
    updateLivePreview();
}

async function handleImageUpload() {
    const file = document.getElementById('bgImage').files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            S.background.value = result.url;
            document.getElementById('currentImage').innerHTML =
                `<img src="${result.url}" alt="Background" style="max-width:100%;margin-top:0.5rem;border-radius:var(--radius-sm);">`;
            markDirty();
            updateLivePreview();
        } else {
            showToast('Upload failed: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Upload error: ' + error.message, 'error');
    }
}

/* ── Zone Panel (tabs: Content / Style / Schedule) ──────────── */
function renderZonePanel(i) {
    const zone = S.layout.zones[i];
    const tab = S.activeTab;

    return `
    <div class="panel-header">
        <div class="panel-header-row">
            <h3>Zone ${i + 1}</h3>
            <button class="btn btn-secondary btn-sm" onclick="deselectZone()" title="Close">
                <i class="material-icons">close</i>
            </button>
        </div>
        <div class="panel-tabs">
            <button class="panel-tab ${tab === 'content' ? 'active' : ''}" onclick="switchTab('content')">Content</button>
            <button class="panel-tab ${tab === 'style' ? 'active' : ''}" onclick="switchTab('style')">Style</button>
            <button class="panel-tab ${tab === 'schedule' ? 'active' : ''}" onclick="switchTab('schedule')">Schedule</button>
        </div>
    </div>
    <div class="panel-body">
        <div class="tab-pane ${tab === 'content' ? 'active' : ''}" id="tabContent">
            ${renderContentTab(zone, i)}
        </div>
        <div class="tab-pane ${tab === 'style' ? 'active' : ''}" id="tabStyle">
            ${renderStyleTab(zone, i)}
        </div>
        <div class="tab-pane ${tab === 'schedule' ? 'active' : ''}" id="tabSchedule">
            ${renderScheduleTab(zone, i)}
        </div>
    </div>`;
}

function switchTab(name) {
    S.activeTab = name;
    renderPanel();
}

/* ── Content Tab ────────────────────────────────────────────── */
function renderContentTab(zone, i) {
    // Type picker cards
    let typeCards = '<div class="zone-type-grid">';
    ZONE_TYPES.forEach(t => {
        const active = zone.type === t.value ? 'active' : '';
        typeCards += `<div class="zone-type-card ${active}" onclick="setZoneType(${i}, '${t.value}')">
            <i class="material-icons">${t.icon}</i>
            <span>${t.label}</span>
        </div>`;
    });
    typeCards += '</div>';

    return typeCards + renderTypeSettings(zone, i);
}

function renderTypeSettings(zone, i) {
    const type = zone.type;
    let html = '';

    if (type === 'empty') return '<p class="help-text" style="margin-top:1rem;">Select a zone type above to configure content.</p>';

    if (type === 'clock') {
        html += `
        <div class="form-field">
            <label>Time Format</label>
            <select data-field="time_format">
                <option value="24h" ${zone.time_format === '24h' ? 'selected' : ''}>24 Hour (14:30:45)</option>
                <option value="12h" ${zone.time_format === '12h' ? 'selected' : ''}>12 Hour (2:30:45 PM)</option>
            </select>
        </div>
        <div class="form-field">
            <label>Date Format</label>
            <select data-field="date_format">
                <option value="full" ${zone.date_format === 'full' ? 'selected' : ''}>Full (Monday, June 22, 2025)</option>
                <option value="short" ${zone.date_format === 'short' ? 'selected' : ''}>Short (Jun 22, 2025)</option>
                <option value="numeric" ${zone.date_format === 'numeric' ? 'selected' : ''}>Numeric (22/06/2025)</option>
                <option value="iso" ${zone.date_format === 'iso' ? 'selected' : ''}>ISO (2025-06-22)</option>
                <option value="custom" ${zone.date_format === 'custom' ? 'selected' : ''}>Custom (DD/MM/YYYY)</option>
            </select>
        </div>`;
    }

    if (type === 'timer') {
        html += `
        <div class="form-field">
            <label>Timer Duration (minutes)</label>
            <input type="number" data-field="content" value="${escHtml(zone.content)}" min="1" placeholder="15">
            <p class="help-text">Enter the number of minutes for the countdown timer</p>
        </div>`;
    }

    if (type === 'announcement') {
        html += `
        <div class="form-field">
            <label>Announcement Text</label>
            <textarea data-field="content" rows="4" placeholder="Enter text...">${escHtml(zone.content)}</textarea>
            <p class="help-text">Use separate lines for multiple announcements (crossfade/marquee modes).</p>
        </div>
        <div class="form-field">
            <label>Display Mode</label>
            <select data-field="announcement_mode">
                <option value="static" ${zone.announcement_mode === 'static' ? 'selected' : ''}>Static</option>
                <option value="crossfade" ${zone.announcement_mode === 'crossfade' ? 'selected' : ''}>Crossfade (rotate)</option>
                <option value="marquee" ${zone.announcement_mode === 'marquee' ? 'selected' : ''}>Marquee (scroll)</option>
            </select>
        </div>
        <div class="form-field">
            <label>Rotation Interval (seconds)</label>
            <input type="number" data-field="announcement_interval" value="${zone.announcement_interval || 5}" min="1" max="60">
            <p class="help-text">Used for crossfade mode only</p>
        </div>`;
    }

    if (type === 'weather') {
        html += `
        <div class="form-field">
            <label>Location</label>
            <div style="display:flex;gap:0.5rem;">
                <input type="text" id="weatherLocation" value="${escHtml(zone.weather_location || '')}" placeholder="Enter city name...">
                <button type="button" class="btn btn-primary btn-sm" onclick="searchWeatherLocation()">Search</button>
            </div>
        </div>
        <div class="form-field">
            <label>Temperature Units</label>
            <select data-field="weather_units">
                <option value="C" ${zone.weather_units === 'C' ? 'selected' : ''}>Celsius (&deg;C)</option>
                <option value="F" ${zone.weather_units === 'F' ? 'selected' : ''}>Fahrenheit (&deg;F)</option>
            </select>
        </div>
        <div class="form-field">
            <label>Refresh Interval (minutes)</label>
            <input type="number" data-field="weather_refresh" value="${zone.weather_refresh || 30}" min="5" max="120">
        </div>
        <div class="form-field">
            <label>Coordinates</label>
            <div style="display:flex;gap:0.5rem;">
                <input type="text" id="weatherLat" value="${zone.weather_lat || ''}" placeholder="Lat" readonly style="background:var(--background-secondary);">
                <input type="text" id="weatherLon" value="${zone.weather_lon || ''}" placeholder="Lon" readonly style="background:var(--background-secondary);">
            </div>
            <p class="help-text">Set automatically when you search for a location</p>
        </div>`;
    }

    if (type === 'rss') {
        html += `
        <div class="form-field">
            <label>RSS Feed URL</label>
            <input type="text" data-field="content" value="${escHtml(zone.content)}" placeholder="https://example.com/rss.xml">
        </div>
        <div class="form-field">
            <label>Display Mode</label>
            <select data-field="rss_mode">
                <option value="list" ${zone.rss_mode === 'list' ? 'selected' : ''}>List (show all)</option>
                <option value="rotate" ${zone.rss_mode === 'rotate' ? 'selected' : ''}>Rotate (one at a time)</option>
                <option value="ticker" ${zone.rss_mode === 'ticker' ? 'selected' : ''}>Ticker (horizontal scroll)</option>
            </select>
        </div>
        <div class="form-field">
            <label>Rotation Interval (seconds)</label>
            <input type="number" data-field="rss_interval" value="${zone.rss_interval || 5}" min="1" max="60">
            <p class="help-text">Used for rotate mode only</p>
        </div>`;
    }

    if (type === 'image') {
        html += `
        <div class="form-field">
            <label>Image URL</label>
            <input type="text" data-field="content" value="${escHtml(zone.content)}" placeholder="https://example.com/image.jpg">
            <p class="help-text">Enter the URL of the image to display</p>
        </div>`;
    }

    if (type === 'video') {
        html += `
        <div class="form-field">
            <label>Video URL</label>
            <input type="text" data-field="content" value="${escHtml(zone.content)}" placeholder="https://example.com/video.mp4">
            <p class="help-text">MP4, WebM, or YouTube URL</p>
        </div>`;
    }

    if (type === 'slideshow') {
        html += `
        <div class="form-field">
            <label>Slideshow Configuration</label>
            <textarea data-field="content" rows="4" placeholder="8:\nimage1.jpg\nimage2.jpg">${escHtml(zone.content)}</textarea>
            <p class="help-text">First line can be "8:" to set 8-second timer. Then list image URLs, one per line.</p>
        </div>`;
    }

    if (type === 'iframe') {
        html += `
        <div class="form-field">
            <label>iFrame Embed Code or URL</label>
            <textarea data-field="content" rows="4" placeholder="<iframe ...> or https://...">${escHtml(zone.content)}</textarea>
            <p class="help-text">Enter the full iframe HTML code or just a URL</p>
        </div>`;
    }

    return html;
}

function setZoneType(i, type) {
    S.layout.zones[i].type = type;
    markDirty();
    renderGrid();
    renderPanel();
    updateLivePreview();
}

/* ── Style Tab ──────────────────────────────────────────────── */
function renderStyleTab(zone) {
    const bg = zone.background || { type: 'transparent' };
    const bgTypeActive = (t) => bg.type === t ? 'active' : '';

    return `
    <!-- Typography -->
    <div class="accordion-section open">
        <button class="accordion-header" onclick="toggleAccordion(this)">
            <i class="material-icons">text_fields</i>
            <span>Typography</span>
            <i class="material-icons accordion-chevron">expand_more</i>
        </button>
        <div class="accordion-content">
            <div class="form-field">
                <label>Font Family</label>
                <select data-field="font_family">
                    <option value="">Use Global Font</option>
                    ${FONT_OPTIONS}
                </select>
            </div>
            <div class="form-field">
                <label>Font Size</label>
                <input type="text" data-field="font_size" value="${escHtml(zone.font_size || '16px')}" placeholder="16px, 1.2em, etc.">
            </div>
        </div>
    </div>

    <!-- Background -->
    <div class="accordion-section open">
        <button class="accordion-header" onclick="toggleAccordion(this)">
            <i class="material-icons">format_paint</i>
            <span>Background</span>
            <i class="material-icons accordion-chevron">expand_more</i>
        </button>
        <div class="accordion-content">
            <div class="form-field">
                <div class="option-cards" id="zoneBgTypeCards">
                    <label class="option-card ${bgTypeActive('transparent')}">
                        <input type="radio" name="zoneBgType" value="transparent" ${bg.type === 'transparent' ? 'checked' : ''}> None
                    </label>
                    <label class="option-card ${bgTypeActive('color')}">
                        <input type="radio" name="zoneBgType" value="color" ${bg.type === 'color' ? 'checked' : ''}> Color
                    </label>
                    <label class="option-card ${bgTypeActive('glassmorphism')}">
                        <input type="radio" name="zoneBgType" value="glassmorphism" ${bg.type === 'glassmorphism' ? 'checked' : ''}> Glass
                    </label>
                    <label class="option-card ${bgTypeActive('image')}">
                        <input type="radio" name="zoneBgType" value="image" ${bg.type === 'image' ? 'checked' : ''}> Image
                    </label>
                </div>
            </div>

            <div id="zoneBgColorFields" style="display:${bg.type === 'color' ? 'block' : 'none'}">
                <div class="form-field">
                    <label>Color</label>
                    <input type="color" id="zoneBackgroundColor" value="${bg.color || '#000000'}">
                </div>
                <div class="form-field">
                    <label>Opacity <span id="zoneBgOpacityValue">${Math.round((bg.opacity || 0.8) * 100)}%</span></label>
                    <input type="range" id="zoneBgOpacity" min="0" max="1" step="0.1" value="${bg.opacity || 0.8}">
                </div>
            </div>

            <div id="zoneBgGlassFields" style="display:${bg.type === 'glassmorphism' ? 'block' : 'none'}">
                <div class="form-field">
                    <label>Blur <span id="zoneBlurValue">${bg.blur || 10}px</span></label>
                    <input type="range" id="zoneBlur" min="0" max="50" value="${bg.blur || 10}">
                </div>
                <div class="form-field">
                    <label>Glass Opacity <span id="zoneGlassOpacityValue">${Math.round((bg.opacity || 0.2) * 100)}%</span></label>
                    <input type="range" id="zoneGlassOpacity" min="0" max="1" step="0.1" value="${bg.opacity || 0.2}">
                </div>
            </div>

            <div id="zoneBgImageFields" style="display:${bg.type === 'image' ? 'block' : 'none'}">
                <div class="form-field">
                    <label>Upload Background Image</label>
                    <input type="file" id="zoneBackgroundImage" accept="image/*">
                    <div id="currentZoneImage">${bg.type === 'image' && bg.url ? `<img src="${bg.url}" alt="Zone Background" style="max-width:100%;margin-top:0.5rem;border-radius:var(--radius-sm);">` : ''}</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Opacity -->
    <div class="accordion-section open">
        <button class="accordion-header" onclick="toggleAccordion(this)">
            <i class="material-icons">opacity</i>
            <span>Zone Opacity</span>
            <i class="material-icons accordion-chevron">expand_more</i>
        </button>
        <div class="accordion-content">
            <div class="form-field">
                <label>Opacity <span id="opacityValue">${Math.round(zone.opacity * 100)}%</span></label>
                <input type="range" data-field="opacity" min="0" max="1" step="0.1" value="${zone.opacity}">
            </div>
        </div>
    </div>`;
}

/* ── Schedule Tab ───────────────────────────────────────────── */
function renderScheduleTab(zone) {
    const schedulableTypes = ['announcement', 'image', 'video', 'slideshow', 'iframe', 'rss'];
    if (!schedulableTypes.includes(zone.type)) {
        return '<p class="help-text" style="padding:1rem;">Schedules are available for announcement, image, video, slideshow, iframe, and RSS zone types.</p>';
    }

    let entries = '';
    if (zone.schedule && Array.isArray(zone.schedule)) {
        zone.schedule.forEach((entry, idx) => {
            entries += renderScheduleEntry(entry, idx);
        });
    }

    return `
    <p class="help-text" style="margin-bottom:1rem;">Schedule different content for specific times and days. Base content is used when no schedule matches.</p>
    <div id="scheduleEntries">${entries}</div>
    <button type="button" class="btn btn-secondary btn-sm" onclick="addScheduleEntry()" style="margin-top:0.5rem;">
        <i class="material-icons">add</i> Add Schedule
    </button>`;
}

function renderScheduleEntry(entry, idx) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let daysHtml = dayNames.map((d, i) => {
        const checked = entry && entry.days && entry.days.includes(i) ? 'checked' : '';
        return `<label class="schedule-day-label"><input type="checkbox" class="schedule-day" value="${i}" ${checked}>${d}</label>`;
    }).join('');

    return `
    <div class="schedule-entry" data-idx="${idx}">
        <div class="schedule-entry-header">
            <input type="text" class="schedule-label" placeholder="Label" value="${escHtml(entry ? (entry.label || '') : '')}">
            <input type="time" class="schedule-start" value="${entry ? (entry.time_start || '') : ''}">
            <span>to</span>
            <input type="time" class="schedule-end" value="${entry ? (entry.time_end || '') : ''}">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeScheduleEntry(this)">
                <i class="material-icons">close</i>
            </button>
        </div>
        <div class="schedule-days">${daysHtml}</div>
        <textarea class="schedule-content" rows="2" placeholder="Override content...">${escHtml(entry ? (entry.content || '') : '')}</textarea>
    </div>`;
}

function addScheduleEntry(entry = null) {
    const container = document.getElementById('scheduleEntries');
    if (!container) return;
    const idx = container.children.length;
    const div = document.createElement('div');
    div.innerHTML = renderScheduleEntry(entry || {}, idx);
    // Append the inner child
    const entryEl = div.firstElementChild;
    container.appendChild(entryEl);

    // Bind change events to auto-save schedule
    entryEl.querySelectorAll('input, textarea').forEach(el => {
        el.addEventListener('change', () => autoSaveSchedule());
    });
}

function removeScheduleEntry(btn) {
    btn.closest('.schedule-entry').remove();
    autoSaveSchedule();
}

function autoSaveSchedule() {
    if (S.selectedZone === null) return;
    const zone = S.layout.zones[S.selectedZone];
    zone.schedule = collectScheduleEntries();
    markDirty();
    updateLivePreview();
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

/* ── Zone Panel Event Binding (auto-save on change) ─────────── */
function bindZonePanelEvents(i) {
    const zone = S.layout.zones[i];
    const panel = document.getElementById('panelContent');

    // All data-field elements: auto-save on change/input
    panel.querySelectorAll('[data-field]').forEach(el => {
        const field = el.dataset.field;
        const event = (el.tagName === 'SELECT' || el.type === 'range' || el.type === 'number') ? 'change' : 'input';

        // Set current value for selects
        if (el.tagName === 'SELECT' && zone[field] !== undefined) {
            el.value = zone[field];
        }

        el.addEventListener(event, () => {
            let val = el.value;
            if (el.type === 'range' || el.type === 'number') val = parseFloat(val);
            zone[field] = val;
            markDirty();

            // Update display labels for range sliders
            if (field === 'opacity') {
                const label = document.getElementById('opacityValue');
                if (label) label.textContent = Math.round(val * 100) + '%';
            }

            renderGrid();
            updateLivePreview();
        });
    });

    // Zone background type cards
    panel.querySelectorAll('#zoneBgTypeCards input[name="zoneBgType"]').forEach(radio => {
        radio.addEventListener('change', function() {
            document.querySelectorAll('#zoneBgTypeCards .option-card').forEach(c => c.classList.remove('active'));
            this.closest('.option-card').classList.add('active');
            const v = this.value;
            document.getElementById('zoneBgColorFields').style.display = v === 'color' ? 'block' : 'none';
            document.getElementById('zoneBgGlassFields').style.display = v === 'glassmorphism' ? 'block' : 'none';
            document.getElementById('zoneBgImageFields').style.display = v === 'image' ? 'block' : 'none';
            autoSaveZoneBg(i);
        });
    });

    // Zone background value changes
    ['zoneBackgroundColor', 'zoneBgOpacity', 'zoneBlur', 'zoneGlassOpacity'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            autoSaveZoneBg(i);
            // Update labels
            if (id === 'zoneBgOpacity') {
                const lbl = document.getElementById('zoneBgOpacityValue');
                if (lbl) lbl.textContent = Math.round(el.value * 100) + '%';
            }
            if (id === 'zoneGlassOpacity') {
                const lbl = document.getElementById('zoneGlassOpacityValue');
                if (lbl) lbl.textContent = Math.round(el.value * 100) + '%';
            }
            if (id === 'zoneBlur') {
                const lbl = document.getElementById('zoneBlurValue');
                if (lbl) lbl.textContent = el.value + 'px';
            }
        });
    });

    // Zone background image
    const zbImg = document.getElementById('zoneBackgroundImage');
    if (zbImg) zbImg.addEventListener('change', () => handleZoneImageUpload(i));

    // Bind existing schedule entries
    panel.querySelectorAll('.schedule-entry input, .schedule-entry textarea').forEach(el => {
        el.addEventListener('change', () => autoSaveSchedule());
    });
}

function autoSaveZoneBg(i) {
    const zone = S.layout.zones[i];
    const checked = document.querySelector('#zoneBgTypeCards input[name="zoneBgType"]:checked');
    if (!checked) return;
    const bgType = checked.value;
    zone.background = { type: bgType };

    if (bgType === 'color') {
        zone.background.color = document.getElementById('zoneBackgroundColor').value;
        zone.background.opacity = parseFloat(document.getElementById('zoneBgOpacity').value);
    } else if (bgType === 'glassmorphism') {
        zone.background.blur = parseInt(document.getElementById('zoneBlur').value);
        zone.background.opacity = parseFloat(document.getElementById('zoneGlassOpacity').value);
    } else if (bgType === 'image') {
        const img = document.getElementById('zoneBackgroundImage');
        if (img && img.dataset.url) zone.background.url = img.dataset.url;
    }

    markDirty();
    updateLivePreview();
}

async function handleZoneImageUpload(i) {
    const file = document.getElementById('zoneBackgroundImage').files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            document.getElementById('currentZoneImage').innerHTML =
                `<img src="${result.url}" alt="Zone Background" style="max-width:100%;margin-top:0.5rem;border-radius:var(--radius-sm);">`;
            document.getElementById('zoneBackgroundImage').dataset.url = result.url;
            S.layout.zones[i].background = { type: 'image', url: result.url };
            markDirty();
            updateLivePreview();
        } else {
            showToast('Upload failed: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Upload error: ' + error.message, 'error');
    }
}

/* ── Weather Location Search ────────────────────────────────── */
async function searchWeatherLocation() {
    const locationInput = document.getElementById('weatherLocation');
    const name = locationInput.value.trim();
    if (!name) return;

    try {
        const response = await fetch(`/api/geocode?name=${encodeURIComponent(name)}`);
        const data = await response.json();

        if (data.error) {
            showToast('Geocode error: ' + data.error, 'error');
            return;
        }
        if (!data.results || data.results.length === 0) {
            showToast('No locations found for "' + name + '"', 'error');
            return;
        }

        const r = data.results[0];
        document.getElementById('weatherLat').value = r.latitude;
        document.getElementById('weatherLon').value = r.longitude;
        const displayName = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
        locationInput.value = displayName;

        if (S.selectedZone !== null) {
            const zone = S.layout.zones[S.selectedZone];
            zone.weather_location = displayName;
            zone.weather_lat = String(r.latitude);
            zone.weather_lon = String(r.longitude);
            markDirty();
            updateLivePreview();
        }
    } catch (error) {
        showToast('Search error: ' + error.message, 'error');
    }
}

/* ── Accordion ──────────────────────────────────────────────── */
function toggleAccordion(btn) {
    const section = btn.closest('.accordion-section');
    section.classList.toggle('open');
}

/* ── Merge / Split ──────────────────────────────────────────── */
function toggleMergeMode() {
    S.mergeMode = !S.mergeMode;
    S.mergeSelection.clear();

    document.getElementById('mergeToggleBtn').style.display = S.mergeMode ? 'none' : '';
    document.getElementById('mergeApplyBtn').style.display = S.mergeMode ? '' : 'none';
    document.getElementById('mergeCancelBtn').style.display = S.mergeMode ? '' : 'none';
    document.getElementById('mergeHint').style.display = S.mergeMode ? '' : 'none';

    renderGrid();
}

function applyMerge() {
    if (S.mergeSelection.size < 2) {
        showToast('Select at least 2 adjacent zones to merge.', 'error');
        return;
    }

    const positions = [];
    for (const idx of S.mergeSelection) {
        const pos = S.zonePositionMap[idx];
        if (!pos) continue;
        for (let dr = 0; dr < pos.rowSpan; dr++)
            for (let dc = 0; dc < pos.colSpan; dc++)
                positions.push({ r: pos.r + dr, c: pos.c + dc });
    }

    if (positions.length < 2) {
        showToast('Select at least 2 adjacent zones to merge.', 'error');
        return;
    }

    const minR = Math.min(...positions.map(p => p.r));
    const maxR = Math.max(...positions.map(p => p.r));
    const minC = Math.min(...positions.map(p => p.c));
    const maxC = Math.max(...positions.map(p => p.c));

    const posSet = new Set(positions.map(p => `${p.r},${p.c}`));
    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            if (!posSet.has(`${r},${c}`)) {
                showToast('Selection must form a complete rectangle.', 'error');
                return;
            }
        }
    }

    const sortedIndices = [...S.mergeSelection].sort((a, b) => a - b);
    const keepIndex = sortedIndices[0];
    const removeIndices = sortedIndices.slice(1);

    S.layout.zones[keepIndex].col_span = maxC - minC + 1;
    S.layout.zones[keepIndex].row_span = maxR - minR + 1;

    removeIndices.sort((a, b) => b - a).forEach(idx => {
        S.layout.zones.splice(idx, 1);
    });

    S.mergeMode = false;
    S.mergeSelection.clear();
    S.selectedZone = null;
    document.getElementById('mergeToggleBtn').style.display = '';
    document.getElementById('mergeApplyBtn').style.display = 'none';
    document.getElementById('mergeCancelBtn').style.display = 'none';
    document.getElementById('mergeHint').style.display = 'none';

    renderGrid();
    renderPanel();
    markDirty();
    updateLivePreview();
}

function splitZone(zoneIndex) {
    const zone = S.layout.zones[zoneIndex];
    const colSpan = zone.col_span || 1;
    const rowSpan = zone.row_span || 1;
    if (colSpan <= 1 && rowSpan <= 1) return;

    zone.col_span = 1;
    zone.row_span = 1;

    const extraCells = (colSpan * rowSpan) - 1;
    for (let j = 0; j < extraCells; j++) {
        S.layout.zones.splice(zoneIndex + 1, 0, makeEmptyZone(Date.now() + j));
    }

    if (S.selectedZone === zoneIndex) {
        S.selectedZone = null;
    }

    renderGrid();
    renderPanel();
    markDirty();
    updateLivePreview();
}

/* ── Live Preview ───────────────────────────────────────────── */
let _previewDebounceTimer = null;

function updateLivePreview() {
    clearTimeout(_previewDebounceTimer);
    _previewDebounceTimer = setTimeout(() => {
        const iframe = document.getElementById('livePreview');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'configUpdate',
                layout: S.layout,
                background: S.background
            }, '*');
        }
    }, 500);
}

function refreshPreview() {
    const iframe = document.getElementById('livePreview');
    if (iframe) iframe.src = iframe.src;
}

function togglePreview() {
    const slideout = document.getElementById('previewSlideout');
    slideout.classList.toggle('visible');
}

/* ── Save Configuration ─────────────────────────────────────── */
async function saveConfig() {
    const displayName = document.getElementById('displayName').value;

    try {
        await signageApp.request(`/api/display/${S.displayId}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: displayName,
                description: S.description,
                layout_config: S.layout,
                background_config: S.background
            })
        });

        S.dirty = false;
        document.getElementById('saveBtn').classList.remove('save-pulse');
        showToast('Configuration saved! Update will be pushed within 30 seconds.');
    } catch (error) {
        showToast('Error saving: ' + error.message, 'error');
    }
}

/* ── Utility ────────────────────────────────────────────────── */
function escHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
