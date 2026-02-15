// Player functionality for fullscreen digital signage display

let displayConfig = null;
let clockInterval = null;
let timerIntervals = {};
let slideshowIntervals = {};
let announcementIntervals = {};
let rssRotationIntervals = {};
let rssCache = {};
let weatherIntervals = {};
let autoHideTimeout = null;

function initializePlayer(config) {
    displayConfig = config;

    console.log('Initializing player with config:', config);

    // Validate config
    if (!config || !config.layout || !config.background) {
        console.error('Invalid display configuration:', config);
        document.getElementById('displayGrid').innerHTML = '<div style="color: white; text-align: center; padding: 50px;">Error: Invalid display configuration</div>';
        return;
    }

    // Set up background
    setupBackground();

    // Set up top bar
    setupTopBar();

    // Set up grid
    setupGrid();

    // Start clock updates
    startClock();

    // Start auto-refresh for RSS feeds
    startRSSRefresh();

    // Handle fullscreen
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F11') {
            e.preventDefault();
            toggleFullscreen();
        }
        if (e.key === 'Escape') {
            exitFullscreen();
        }
    });

    // Auto-refresh display every 5 minutes
    setInterval(refreshDisplay, 5 * 60 * 1000);
}

// ─── Top Bar ──────────────────────────────────────────────────

function setupTopBar() {
    const topBar = document.getElementById('topBar');
    const displayGrid = document.getElementById('displayGrid');
    const topBarConfig = (displayConfig.layout.top_bar) || {};
    const mode = topBarConfig.mode || 'visible';

    // Remove any existing mode classes
    topBar.classList.remove('top-bar--overlay', 'top-bar--auto-hide', 'top-bar--hidden', 'top-bar--shown');
    displayGrid.classList.remove('display-grid--full');

    switch (mode) {
        case 'overlay':
            topBar.classList.add('top-bar--overlay');
            displayGrid.classList.add('display-grid--full');
            break;
        case 'auto-hide':
            topBar.classList.add('top-bar--auto-hide');
            displayGrid.classList.add('display-grid--full');
            setupAutoHide(topBar);
            break;
        case 'hidden':
            topBar.classList.add('top-bar--hidden');
            displayGrid.classList.add('display-grid--full');
            break;
        // 'visible' is the default — no extra classes needed
    }

    // Handle show_seconds for top bar
    const showSeconds = topBarConfig.show_seconds !== false; // default true
    const secondsEl = topBar.querySelector('.clock-seconds');
    if (secondsEl && !showSeconds) {
        secondsEl.style.display = 'none';
    }
}

function setupAutoHide(topBar) {
    const TRIGGER_ZONE = 60; // px from top edge
    const HIDE_DELAY = 3000; // ms

    function showBar() {
        topBar.classList.add('top-bar--shown');
        clearTimeout(autoHideTimeout);
        autoHideTimeout = setTimeout(() => {
            topBar.classList.remove('top-bar--shown');
        }, HIDE_DELAY);
    }

    document.addEventListener('mousemove', function(e) {
        if (e.clientY <= TRIGGER_ZONE) {
            showBar();
        }
    });

    document.addEventListener('touchstart', function(e) {
        const touch = e.touches[0];
        if (touch && touch.clientY <= TRIGGER_ZONE) {
            showBar();
        }
    });
}

// ─── Background ───────────────────────────────────────────────

function setupBackground() {
    const body = document.body;
    const bg = displayConfig.background;

    // Apply global font to body (affects top bar)
    const globalFont = displayConfig.layout.global_font || 'Arial, sans-serif';
    body.style.fontFamily = globalFont;
    console.log('Applied global font to body:', globalFont);

    // Clear any existing background styles first
    body.style.background = '';
    body.style.backgroundColor = '';
    body.style.backgroundImage = '';
    body.classList.remove('bg-color', 'bg-image');

    if (bg.type === 'color') {
        body.style.backgroundColor = bg.value;
        body.classList.add('bg-color');
        console.log('Applied global background color:', bg.value);
    } else if (bg.type === 'image' && bg.value) {
        body.style.backgroundImage = `url(${bg.value})`;
        body.style.backgroundSize = 'cover';
        body.style.backgroundPosition = 'center';
        body.style.backgroundRepeat = 'no-repeat';
        body.style.backgroundAttachment = 'fixed';
        body.classList.add('bg-image');
        console.log('Applied global background image:', bg.value);
    } else {
        // Default fallback background
        body.style.backgroundColor = '#000';
        console.log('Applied default background color');
    }
}

// ─── Grid ─────────────────────────────────────────────────────

function setupGrid() {
    console.log('Setting up grid with layout:', displayConfig.layout);

    const grid = displayConfig.layout.grid;
    const displayGrid = document.getElementById('displayGrid');

    if (!grid || !grid.rows || !grid.cols) {
        console.error('Invalid grid configuration:', grid);
        displayGrid.innerHTML = '<div style="color: white; text-align: center; padding: 50px;">Error: Invalid grid configuration</div>';
        return;
    }

    displayGrid.style.gridTemplateRows = `repeat(${grid.rows}, 1fr)`;
    displayGrid.style.gridTemplateColumns = `repeat(${grid.cols}, 1fr)`;

    // Clear existing zones
    displayGrid.innerHTML = '';

    // Create zones
    if (displayConfig.layout.zones && Array.isArray(displayConfig.layout.zones)) {
        displayConfig.layout.zones.forEach((zone, index) => {
            console.log('Creating zone:', index, zone);
            const zoneElement = createZone(zone, index);
            displayGrid.appendChild(zoneElement);
        });
    } else {
        console.error('No zones found in layout configuration');
        displayGrid.innerHTML = '<div style="color: white; text-align: center; padding: 50px;">Error: No zones configured</div>';
    }
}

// ─── Zone Creation ────────────────────────────────────────────

function createZone(zone, index) {
    console.log('Creating zone', index, 'with type:', zone.type, 'zone data:', zone);

    const zoneElement = document.createElement('div');
    zoneElement.className = 'player-zone';
    zoneElement.id = `zone-${index}`;

    // Use CSS custom property for opacity so entrance animation works correctly
    const zoneOpacity = zone.opacity || 1.0;
    zoneElement.style.setProperty('--zone-opacity', zoneOpacity);

    // Add staggered animation delay for entrance effect
    zoneElement.style.animationDelay = `${index * 0.1}s`;

    // Apply zone background - if transparent, make sure zone is truly transparent
    if (zone.background && zone.background.type === 'transparent') {
        zoneElement.style.background = 'transparent';
        zoneElement.style.backgroundColor = 'transparent';
        console.log('Applied transparent background to zone');
    } else {
        applyZoneBackground(zoneElement, zone.background);
    }

    const contentElement = document.createElement('div');
    contentElement.className = 'zone-content';

    // Add staggered animation delay for content entrance
    contentElement.style.animationDelay = `${index * 0.1 + 0.15}s`;

    // For transparent zones, make content transparent too
    if (zone.background && zone.background.type === 'transparent') {
        contentElement.style.background = 'transparent';
        contentElement.style.backgroundColor = 'transparent';
    } else if (zone.background && zone.background.type !== 'transparent') {
        // Apply background to content element to override widget defaults
        applyZoneBackground(contentElement, zone.background);
    }

    // Apply typography
    const globalFont = displayConfig.layout.global_font || 'Arial, sans-serif';
    const zoneFont = zone.font_family || globalFont;
    const zoneFontSize = zone.font_size || '16px';

    contentElement.style.fontFamily = zoneFont;
    contentElement.style.fontSize = zoneFontSize;

    console.log('Applying font:', zoneFont, 'size:', zoneFontSize);

    switch (zone.type) {
        case 'clock':
            createClockWidget(contentElement, zone);
            break;
        case 'timer':
            createTimerWidget(contentElement, zone.content, index);
            break;
        case 'announcement':
            createAnnouncementWidget(contentElement, zone, index);
            break;
        case 'iframe':
            createIframeWidget(contentElement, zone.content);
            break;
        case 'rss':
            createRSSWidget(contentElement, zone, index);
            break;
        case 'image':
            createImageWidget(contentElement, zone.content);
            break;
        case 'video':
            createVideoWidget(contentElement, zone.content);
            break;
        case 'slideshow':
            createSlideshowWidget(contentElement, zone.content, index);
            break;
        case 'weather':
            createWeatherWidget(contentElement, zone, index);
            break;
        default:
            console.log('Creating empty widget for zone type:', zone.type);
            createEmptyWidget(contentElement);
    }

    zoneElement.appendChild(contentElement);
    console.log('Zone element created:', zoneElement);
    return zoneElement;
}

// ─── Clock Widget ─────────────────────────────────────────────

function createClockWidget(container, zone) {
    container.className += ' widget-clock';

    const timeFormat = zone.time_format || '24h';
    const dateFormat = zone.date_format || 'full';

    console.log('Creating clock widget with time format:', timeFormat, 'date format:', dateFormat);

    container.innerHTML = `
        <div>
            <div class="clock-time" data-time-format="${timeFormat}">
                <span class="clock-hours">--</span><span class="clock-separator">:</span><span class="clock-minutes">--</span><span class="clock-seconds">:--</span>${timeFormat === '12h' ? '<span class="clock-ampm"></span>' : ''}
            </div>
            <div class="clock-date" data-date-format="${dateFormat}">Loading...</div>
        </div>
    `;

    // Store zone settings for clock formatting
    container.dataset.timeFormat = timeFormat;
    container.dataset.dateFormat = dateFormat;
}

// ─── Timer Widget ─────────────────────────────────────────────

function createTimerWidget(container, duration, index) {
    container.className += ' widget-timer';

    const minutes = parseInt(duration) || 10;
    const totalSeconds = minutes * 60;

    container.innerHTML = `
        <div>
            <div class="timer-display" id="timer-${index}">00:00</div>
            <div class="timer-label">Countdown Timer</div>
            <div class="timer-progress-container">
                <div class="timer-progress-bar" id="timer-progress-${index}" style="width: 100%;"></div>
            </div>
        </div>
    `;

    startTimer(index, totalSeconds);
}

// ─── Announcement Widget ──────────────────────────────────────

function createAnnouncementWidget(container, zone, index) {
    container.className += ' widget-announcement';

    const text = zone.content || '';
    const mode = zone.announcement_mode || 'static';
    const interval = (zone.announcement_interval || 5) * 1000;

    if (mode === 'crossfade') {
        // Split content by newlines into slides
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length <= 1) {
            // Fall back to static if only one line
            container.innerHTML = `<div class="announcement-text">${escapeHtml(text)}</div>`;
            return;
        }

        let slidesHtml = '<div class="announcement-carousel">';
        lines.forEach((line, i) => {
            slidesHtml += `<div class="announcement-slide${i === 0 ? ' active' : ''}">${escapeHtml(line)}</div>`;
        });
        slidesHtml += '</div>';
        container.innerHTML = slidesHtml;

        startAnnouncementRotation(container, index, interval);

    } else if (mode === 'marquee') {
        const lines = text.split('\n').filter(l => l.trim());
        const joined = lines.map(l => escapeHtml(l)).join(' \u2022 ');

        // Calculate duration proportional to content length
        const baseDuration = Math.max(10, joined.length * 0.15);

        container.innerHTML = `
            <div class="announcement-marquee">
                <div class="announcement-marquee-inner" style="--marquee-duration: ${baseDuration}s;">${joined}</div>
            </div>
        `;

    } else {
        // Static mode (default)
        container.innerHTML = `<div class="announcement-text">${escapeHtml(text)}</div>`;
    }
}

function startAnnouncementRotation(container, index, interval) {
    const slides = container.querySelectorAll('.announcement-slide');
    if (slides.length <= 1) return;

    let current = 0;

    announcementIntervals[index] = setInterval(() => {
        slides[current].classList.remove('active');
        current = (current + 1) % slides.length;
        slides[current].classList.add('active');
    }, interval);
}

// ─── iframe Widget ────────────────────────────────────────────

function createIframeWidget(container, content) {
    container.className += ' widget-iframe';

    let iframeHtml = content;

    // If content looks like a URL, wrap it in an iframe
    if (content && !content.includes('<iframe') && (content.startsWith('http') || content.startsWith('//'))) {
        iframeHtml = `<iframe src="${content}" frameborder="0" allowfullscreen></iframe>`;
    }

    container.innerHTML = iframeHtml;
}

// ─── RSS Widget ───────────────────────────────────────────────

function createRSSWidget(container, zone, index) {
    container.className += ' widget-rss';

    const feedUrl = zone.content || '';
    const rssMode = zone.rss_mode || 'list';
    const rssInterval = (zone.rss_interval || 8) * 1000;

    // Store mode as data attributes for later use
    container.dataset.rssMode = rssMode;
    container.dataset.rssInterval = rssInterval;

    container.innerHTML = `
        <div class="rss-title widget-loading">Loading RSS Feed...</div>
        <div id="rss-content-${index}"></div>
    `;

    if (feedUrl) {
        loadRSSFeed(feedUrl, index);
    }
}

// ─── Other Widgets ────────────────────────────────────────────

function createEmptyWidget(container) {
    container.className += ' widget-empty';
    container.innerHTML = `
        <div class="empty-text">Empty Zone</div>
    `;
}

function createImageWidget(container, imageUrl) {
    container.className += ' widget-image';

    if (imageUrl) {
        // Support both URLs and local paths, handle spaces in filenames
        let imageSrc = imageUrl;
        if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
            // Local file path - encode spaces and convert to static URL
            const encodedFilename = encodeURIComponent(imageUrl);
            imageSrc = `/static/uploads/${encodedFilename}`;
        } else {
            // For URLs, encode to handle spaces
            imageSrc = encodeURI(imageUrl);
        }

        container.innerHTML = `
            <img src="${escapeHtml(imageSrc)}"
                 alt="Zone Image"
                 style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;"
                 onerror="this.parentElement.innerHTML='<div class=\\'empty-text\\'>Failed to load image</div>'" />
        `;
    } else {
        container.innerHTML = `
            <div class="empty-text">No image URL provided</div>
        `;
    }
}

function createVideoWidget(container, videoUrl) {
    container.className += ' widget-video';

    if (videoUrl) {
        // Check if it's a YouTube URL
        const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const youtubeMatch = videoUrl.match(youtubeRegex);

        if (youtubeMatch) {
            // YouTube video - use embed iframe
            const videoId = youtubeMatch[1];
            container.innerHTML = `
                <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1"
                        style="width: 100%; height: 100%; border: none; border-radius: 8px;"
                        allow="autoplay; encrypted-media"
                        allowfullscreen>
                </iframe>
            `;
            return;
        }

        // Regular video file
        let videoSrc = videoUrl;
        if (!videoUrl.startsWith('http') && !videoUrl.startsWith('/')) {
            const encodedFilename = encodeURIComponent(videoUrl);
            videoSrc = `/static/uploads/${encodedFilename}`;
        } else {
            videoSrc = encodeURI(videoUrl);
        }

        const videoElement = document.createElement('video');
        videoElement.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 8px;';
        videoElement.autoplay = true;
        videoElement.muted = true;
        videoElement.loop = true;
        videoElement.controls = false;

        if (videoSrc.toLowerCase().includes('.mp4')) {
            videoElement.innerHTML = `<source src="${escapeHtml(videoSrc)}" type="video/mp4">`;
        } else if (videoSrc.toLowerCase().includes('.webm')) {
            videoElement.innerHTML = `<source src="${escapeHtml(videoSrc)}" type="video/webm">`;
        } else if (videoSrc.toLowerCase().includes('.ogg')) {
            videoElement.innerHTML = `<source src="${escapeHtml(videoSrc)}" type="video/ogg">`;
        } else {
            videoElement.src = escapeHtml(videoSrc);
        }

        videoElement.onerror = function() {
            container.innerHTML = '<div class="empty-text">Failed to load video</div>';
        };

        container.innerHTML = '';
        container.appendChild(videoElement);
    } else {
        container.innerHTML = `
            <div class="empty-text">No video URL provided</div>
        `;
    }
}

function createSlideshowWidget(container, content, index) {
    container.className += ' widget-slideshow';

    if (content) {
        const lines = content.split('\n').filter(line => line.trim());

        if (lines.length === 0) {
            container.innerHTML = '<div class="empty-text">No images provided for slideshow</div>';
            return;
        }

        let slideTimer = 5000;
        let imageStartIndex = 0;

        if (lines[0].includes(':') && lines[0].match(/^\d+:/)) {
            const timerMatch = lines[0].match(/^(\d+):/);
            if (timerMatch) {
                slideTimer = parseInt(timerMatch[1]) * 1000;
                const remainingPart = lines[0].substring(timerMatch[0].length).trim();
                if (remainingPart) {
                    lines[0] = remainingPart;
                } else {
                    imageStartIndex = 1;
                }
            }
        }

        const imageList = lines.slice(imageStartIndex).filter(url => url.trim());

        if (imageList.length === 0) {
            container.innerHTML = '<div class="empty-text">No images provided for slideshow</div>';
            return;
        }

        const processedImages = imageList.map(url => {
            const trimmedUrl = url.trim();
            if (!trimmedUrl.startsWith('http') && !trimmedUrl.startsWith('/')) {
                const encodedFilename = encodeURIComponent(trimmedUrl);
                return `/static/uploads/${encodedFilename}`;
            }
            return encodeURI(trimmedUrl);
        });

        container.innerHTML = `
            <div class="slideshow-container" id="slideshow-${index}">
                <img class="slideshow-image" alt="Slideshow Image" />
                <div class="slideshow-timer-indicator" style="display: none; opacity: 0;">
                    <span>${slideTimer / 1000}s</span>
                </div>
            </div>
        `;

        startSlideshow(index, processedImages, slideTimer);
    } else {
        container.innerHTML = `
            <div class="empty-text">No slideshow content provided</div>
        `;
    }
}

// ─── Weather Widget ───────────────────────────────────────────

function createWeatherWidget(container, zone, index) {
    container.className += ' widget-weather';

    const lat = zone.weather_lat;
    const lon = zone.weather_lon;
    const units = zone.weather_units || 'C';
    const location = zone.weather_location || 'Unknown';
    const refreshMin = zone.weather_refresh || 30;

    container.innerHTML = `
        <div class="weather-container">
            <div class="weather-loading">Loading weather...</div>
        </div>
    `;

    if (lat && lon) {
        loadWeather(container, lat, lon, units, location, index);
        weatherIntervals[index] = setInterval(() => {
            loadWeather(container, lat, lon, units, location, index);
        }, refreshMin * 60 * 1000);
    } else {
        container.querySelector('.weather-container').innerHTML =
            '<div class="empty-text">No location configured</div>';
    }
}

async function loadWeather(container, lat, lon, units, location, index) {
    try {
        const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}&units=${units}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        const c = data.current;
        const unitSymbol = c.unit || '°C';
        const windUnit = c.wind_unit || 'km/h';

        let forecastHtml = '';
        if (data.forecast && data.forecast.length > 0) {
            forecastHtml = '<div class="weather-forecast">';
            data.forecast.forEach(day => {
                const dayName = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                forecastHtml += `
                    <div class="weather-forecast-day">
                        <div class="forecast-day-name">${dayName}</div>
                        <div class="forecast-emoji">${day.emoji}</div>
                        <div class="forecast-temps">
                            <span class="forecast-high">${Math.round(day.temp_max)}°</span>
                            <span class="forecast-low">${Math.round(day.temp_min)}°</span>
                        </div>
                    </div>
                `;
            });
            forecastHtml += '</div>';
        }

        container.querySelector('.weather-container').innerHTML = `
            <div class="weather-current">
                <div class="weather-emoji">${c.emoji}</div>
                <div class="weather-temp">${Math.round(c.temperature)}${unitSymbol}</div>
                <div class="weather-condition">${c.condition}</div>
            </div>
            <div class="weather-details">
                <div class="weather-detail"><span>💧</span> ${c.humidity}%</div>
                <div class="weather-detail"><span>💨</span> ${Math.round(c.wind_speed)} ${windUnit}</div>
            </div>
            <div class="weather-location">${escapeHtml(location)}</div>
            ${forecastHtml}
        `;
    } catch (error) {
        console.error('Weather loading error:', error);
        container.querySelector('.weather-container').innerHTML =
            '<div class="widget-error">Failed to load weather</div>';
    }
}

// ─── Clock Updates ────────────────────────────────────────────

function startClock() {
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');

    const hours24 = pad(now.getHours());
    const hours12 = pad(now.getHours() % 12 || 12);
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());
    const ampm = now.getHours() >= 12 ? 'PM' : 'AM';

    const formatDateFull = (date) => date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const formatDateShort = (date) => date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const formatDateNumeric = (date) => date.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const formatDateISO = (date) => date.toISOString().split('T')[0];

    // Update top bar structured clock
    const topBar = document.getElementById('topBar');
    const tbHours = topBar.querySelector('.clock-hours');
    const tbMinutes = topBar.querySelector('.clock-minutes');
    const tbSeconds = topBar.querySelector('.clock-seconds');

    if (tbHours) tbHours.textContent = hours24;
    if (tbMinutes) tbMinutes.textContent = minutes;
    if (tbSeconds) tbSeconds.textContent = seconds;

    document.getElementById('currentDate').textContent = formatDateFull(now);

    // Update clock widgets with their specific formatting
    const clockElements = document.querySelectorAll('.widget-clock');
    clockElements.forEach(widget => {
        const timeFormat = widget.dataset.timeFormat || '24h';
        const dateFormat = widget.dataset.dateFormat || 'full';

        const clockHours = widget.querySelector('.clock-hours');
        const clockMinutes = widget.querySelector('.clock-minutes');
        const clockSeconds = widget.querySelector('.clock-seconds');
        const clockAmpm = widget.querySelector('.clock-ampm');
        const clockDate = widget.querySelector('.clock-date');

        if (clockHours) clockHours.textContent = timeFormat === '12h' ? hours12 : hours24;
        if (clockMinutes) clockMinutes.textContent = minutes;
        if (clockSeconds) clockSeconds.textContent = seconds;
        if (clockAmpm) clockAmpm.textContent = ampm;

        if (clockDate) {
            switch (dateFormat) {
                case 'short':
                    clockDate.textContent = formatDateShort(now);
                    break;
                case 'numeric':
                    clockDate.textContent = formatDateNumeric(now);
                    break;
                case 'iso':
                    clockDate.textContent = formatDateISO(now);
                    break;
                case 'custom':
                    clockDate.textContent = now.toLocaleDateString('en-GB');
                    break;
                default:
                    clockDate.textContent = formatDateFull(now);
            }
        }
    });
}

// ─── Timer ────────────────────────────────────────────────────

function startTimer(index, totalSeconds) {
    let remainingSeconds = totalSeconds;
    const warningThreshold = Math.min(60, totalSeconds * 0.2);
    const dangerThreshold = Math.min(10, totalSeconds * 0.05);

    const updateTimer = () => {
        const mins = Math.floor(remainingSeconds / 60);
        const secs = remainingSeconds % 60;
        const display = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        const timerElement = document.getElementById(`timer-${index}`);
        const progressBar = document.getElementById(`timer-progress-${index}`);

        if (timerElement) {
            timerElement.textContent = display;

            // Calculate percentage for progress bar
            const pct = (remainingSeconds / totalSeconds) * 100;

            // Color gradient: green > yellow > red
            let color;
            if (pct > 50) {
                color = '#10b981'; // green (success)
            } else if (pct > 20) {
                color = '#f59e0b'; // yellow (warning)
            } else {
                color = '#ef4444'; // red (danger)
            }

            if (progressBar) {
                progressBar.style.width = pct + '%';
                progressBar.style.backgroundColor = color;
            }

            // Update visual state based on remaining time (CSS classes from remote)
            timerElement.classList.remove('timer-warning', 'timer-danger');
            if (remainingSeconds <= dangerThreshold && remainingSeconds > 0) {
                timerElement.classList.add('timer-danger');
            } else if (remainingSeconds <= warningThreshold && remainingSeconds > 0) {
                timerElement.classList.add('timer-warning');
            }

            if (remainingSeconds <= 0) {
                timerElement.classList.add('timer-danger');
                timerElement.textContent = '00:00';
                if (progressBar) {
                    progressBar.style.width = '0%';
                }
                clearInterval(timerIntervals[index]);

                // Pulse effect when timer ends
                timerElement.style.animation = 'timerPulse 0.5s ease-in-out infinite';

                return;
            }
        }

        remainingSeconds--;
    };

    updateTimer();
    timerIntervals[index] = setInterval(updateTimer, 1000);
}

// ─── Slideshow ────────────────────────────────────────────────

function startSlideshow(index, images, slideTimer = 5000) {
    let currentImageIndex = 0;
    const slideshowContainer = document.getElementById(`slideshow-${index}`);
    const imageElement = slideshowContainer.querySelector('.slideshow-image');
    const timerIndicator = slideshowContainer.querySelector('.slideshow-timer-indicator');

    if (!imageElement || images.length === 0) return;

    // Set transition for smooth crossfade
    imageElement.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1)';

    const showNextImage = () => {
        // Fade out
        imageElement.style.opacity = '0';

        setTimeout(() => {
            imageElement.src = images[currentImageIndex];
            imageElement.onload = () => {
                // Fade in
                imageElement.style.opacity = '1';
                // Show timer indicator briefly when image changes (only if multiple images)
                if (images.length > 1 && timerIndicator) {
                    timerIndicator.style.display = 'block';
                    timerIndicator.style.opacity = '1';
                    setTimeout(() => {
                        timerIndicator.style.opacity = '0';
                        setTimeout(() => {
                            timerIndicator.style.display = 'none';
                        }, 300);
                    }, 1500);
                }
            };
            imageElement.onerror = () => {
                console.error('Failed to load slideshow image:', images[currentImageIndex]);
                currentImageIndex = (currentImageIndex + 1) % images.length;
                setTimeout(showNextImage, 100);
                return;
            };

            currentImageIndex = (currentImageIndex + 1) % images.length;
        }, 400);
    };

    showNextImage();

    if (images.length > 1) {
        slideshowIntervals[index] = setInterval(showNextImage, slideTimer);
    }
}

// ─── RSS Feed ─────────────────────────────────────────────────

async function loadRSSFeed(feedUrl, index) {
    try {
        const response = await fetch(`/api/rss?url=${encodeURIComponent(feedUrl)}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        const container = document.getElementById(`rss-content-${index}`);
        const titleElement = container.parentElement.querySelector('.rss-title');
        const widgetContainer = container.parentElement; // the .zone-content.widget-rss

        if (titleElement) {
            titleElement.textContent = data.title || 'RSS Feed';
            titleElement.classList.remove('widget-loading');
        }

        const rssMode = widgetContainer.dataset.rssMode || 'list';
        const rssInterval = parseInt(widgetContainer.dataset.rssInterval) || 8000;

        if (rssMode === 'rotate') {
            renderRSSRotate(container, data.items, index, rssInterval);
        } else if (rssMode === 'ticker') {
            renderRSSTicker(container, data.items, index);
        } else {
            renderRSSList(container, data.items);
        }

        rssCache[feedUrl] = { data, timestamp: Date.now() };

    } catch (error) {
        console.error('RSS loading error:', error);
        const container = document.getElementById(`rss-content-${index}`);
        if (container) {
            container.innerHTML = `<div class="widget-error">Failed to load RSS feed</div>`;
            const titleEl = container.parentElement.querySelector('.rss-title');
            if (titleEl) titleEl.classList.remove('widget-loading');
        }
    }
}

function renderRSSList(container, items) {
    let html = '';
    items.forEach(item => {
        html += `
            <div class="rss-item">
                <div class="rss-item-title">${escapeHtml(item.title)}</div>
                <div class="rss-item-description">${truncateText(stripHtml(item.description), 200)}</div>
                ${item.published ? `<div class="rss-item-date">${formatRSSDate(item.published)}</div>` : ''}
            </div>
        `;
    });
    container.innerHTML = html;
}

function renderRSSRotate(container, items, index, interval) {
    if (items.length === 0) return;

    let html = '<div class="rss-single-item">';
    items.forEach((item, i) => {
        html += `
            <div class="rss-item${i === 0 ? ' active' : ''}">
                <div class="rss-item-title">${escapeHtml(item.title)}</div>
                <div class="rss-item-description">${truncateText(stripHtml(item.description), 300)}</div>
                ${item.published ? `<div class="rss-item-date">${formatRSSDate(item.published)}</div>` : ''}
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;

    startRSSRotation(container, index, interval);
}

function startRSSRotation(container, index, interval) {
    const items = container.querySelectorAll('.rss-single-item .rss-item');
    if (items.length <= 1) return;

    let current = 0;

    rssRotationIntervals[index] = setInterval(() => {
        items[current].classList.remove('active');
        current = (current + 1) % items.length;
        items[current].classList.add('active');
    }, interval);
}

function renderRSSTicker(container, items, index) {
    if (items.length === 0) return;

    const tickerContent = items.map(item =>
        `<span class="rss-ticker-item">${escapeHtml(item.title)}</span>`
    ).join('<span class="rss-ticker-separator">\u2022</span>');

    // Calculate duration proportional to content length
    const totalLength = items.reduce((acc, item) => acc + item.title.length, 0);
    const duration = Math.max(15, totalLength * 0.2);

    container.innerHTML = `
        <div class="rss-ticker">
            <div class="rss-ticker-inner" style="--ticker-duration: ${duration}s;">
                ${tickerContent}<span class="rss-ticker-separator">\u2022</span>${tickerContent}
            </div>
        </div>
    `;
}

function startRSSRefresh() {
    // Refresh RSS feeds every 10 minutes
    setInterval(() => {
        displayConfig.layout.zones.forEach((zone, index) => {
            if (zone.type === 'rss' && zone.content) {
                loadRSSFeed(zone.content, index);
            }
        });
    }, 10 * 60 * 1000);
}

// ─── Display Refresh & Cleanup ────────────────────────────────

function refreshDisplay() {
    if (clockInterval) clearInterval(clockInterval);

    Object.values(timerIntervals).forEach(interval => clearInterval(interval));
    Object.values(slideshowIntervals).forEach(interval => clearInterval(interval));
    Object.values(announcementIntervals).forEach(interval => clearInterval(interval));
    Object.values(rssRotationIntervals).forEach(interval => clearInterval(interval));
    Object.values(weatherIntervals).forEach(interval => clearInterval(interval));

    if (autoHideTimeout) clearTimeout(autoHideTimeout);

    // Reload the page to get fresh content
    window.location.reload();
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function exitFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
}

// ─── Zone Background ─────────────────────────────────────────

function applyZoneBackground(element, background) {
    console.log('Applying background:', background);

    if (!background || background.type === 'transparent') {
        console.log('Using transparent background');
        return;
    }

    switch (background.type) {
        case 'color':
            const rgba = hexToRgba(background.color, background.opacity || 0.8);
            element.style.backgroundColor = rgba;
            console.log('Applied color background:', rgba);
            break;
        case 'glassmorphism':
            const glassOpacity = background.opacity || 0.2;
            const blurAmount = background.blur || 10;
            element.style.backgroundColor = `rgba(255, 255, 255, ${glassOpacity})`;
            element.style.backdropFilter = `blur(${blurAmount}px)`;
            element.style.webkitBackdropFilter = `blur(${blurAmount}px)`;
            element.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            element.style.borderRadius = '8px';
            console.log('Applied glassmorphism background with blur:', blurAmount, 'opacity:', glassOpacity);
            break;
        case 'image':
            if (background.url) {
                element.style.backgroundImage = `url(${background.url})`;
                element.style.backgroundSize = 'cover';
                element.style.backgroundPosition = 'center';
                element.style.backgroundRepeat = 'no-repeat';
                console.log('Applied image background:', background.url);
            }
            break;
        default:
            console.log('Unknown background type:', background.type);
    }
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Utility Functions ────────────────────────────────────────

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

function formatRSSDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        return dateString;
    }
}

// ─── Cleanup on Page Unload ───────────────────────────────────

window.addEventListener('beforeunload', function() {
    if (clockInterval) clearInterval(clockInterval);

    Object.values(timerIntervals).forEach(interval => clearInterval(interval));
    Object.values(slideshowIntervals).forEach(interval => clearInterval(interval));
    Object.values(announcementIntervals).forEach(interval => clearInterval(interval));
    Object.values(rssRotationIntervals).forEach(interval => clearInterval(interval));
    Object.values(weatherIntervals).forEach(interval => clearInterval(interval));

    if (autoHideTimeout) clearTimeout(autoHideTimeout);
});
