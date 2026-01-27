// Player functionality for fullscreen digital signage display

let displayConfig = null;
let clockInterval = null;
let timerIntervals = {};
let slideshowIntervals = {};
let rssCache = {};

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

function createZone(zone, index) {
    console.log('Creating zone', index, 'with type:', zone.type, 'zone data:', zone);

    const zoneElement = document.createElement('div');
    zoneElement.className = 'player-zone';
    zoneElement.style.opacity = zone.opacity || 1.0;
    zoneElement.id = `zone-${index}`;

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
            createAnnouncementWidget(contentElement, zone.content);
            break;
        case 'iframe':
            createIframeWidget(contentElement, zone.content);
            break;
        case 'rss':
            createRSSWidget(contentElement, zone.content, index);
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
        default:
            console.log('Creating empty widget for zone type:', zone.type);
            createEmptyWidget(contentElement);
    }
    
    zoneElement.appendChild(contentElement);
    console.log('Zone element created:', zoneElement);
    return zoneElement;
}

function createClockWidget(container, zone) {
    container.className += ' widget-clock';
    
    const timeFormat = zone.time_format || '24h';
    const dateFormat = zone.date_format || 'full';
    
    console.log('Creating clock widget with time format:', timeFormat, 'date format:', dateFormat);
    
    container.innerHTML = `
        <div>
            <div class="clock-time" data-time-format="${timeFormat}">--:--:--</div>
            <div class="clock-date" data-date-format="${dateFormat}">Loading...</div>
        </div>
    `;
    
    // Store zone settings for clock formatting
    container.dataset.timeFormat = timeFormat;
    container.dataset.dateFormat = dateFormat;
}

function createTimerWidget(container, duration, index) {
    container.className += ' widget-timer';
    
    const minutes = parseInt(duration) || 10;
    const totalSeconds = minutes * 60;
    
    container.innerHTML = `
        <div>
            <div class="timer-display" id="timer-${index}">00:00</div>
            <div class="timer-label">Countdown Timer</div>
        </div>
    `;
    
    startTimer(index, totalSeconds);
}

function createAnnouncementWidget(container, text) {
    container.className += ' widget-announcement';
    container.innerHTML = `
        <div class="announcement-text">${escapeHtml(text)}</div>
    `;
}

function createIframeWidget(container, content) {
    container.className += ' widget-iframe';
    
    let iframeHtml = content;
    
    // If content looks like a URL, wrap it in an iframe
    if (content && !content.includes('<iframe') && (content.startsWith('http') || content.startsWith('//'))) {
        iframeHtml = `<iframe src="${content}" frameborder="0" allowfullscreen></iframe>`;
    }
    
    container.innerHTML = iframeHtml;
}

function createRSSWidget(container, feedUrl, index) {
    container.className += ' widget-rss';
    container.innerHTML = `
        <div class="rss-title">Loading RSS Feed...</div>
        <div id="rss-content-${index}"></div>
    `;
    
    if (feedUrl) {
        loadRSSFeed(feedUrl, index);
    }
}

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
            // Local file path - encode spaces and convert to static URL
            const encodedFilename = encodeURIComponent(videoUrl);
            videoSrc = `/static/uploads/${encodedFilename}`;
        } else {
            // For URLs, encode to handle spaces
            videoSrc = encodeURI(videoUrl);
        }
        
        // Support different video formats and provide better error handling
        const videoElement = document.createElement('video');
        videoElement.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 8px;';
        videoElement.autoplay = true;
        videoElement.muted = true;
        videoElement.loop = true;
        videoElement.controls = false;
        
        // Handle different video formats
        if (videoSrc.toLowerCase().includes('.mp4')) {
            videoElement.innerHTML = `
                <source src="${escapeHtml(videoSrc)}" type="video/mp4">
                Your browser does not support MP4 videos.
            `;
        } else if (videoSrc.toLowerCase().includes('.webm')) {
            videoElement.innerHTML = `
                <source src="${escapeHtml(videoSrc)}" type="video/webm">
                Your browser does not support WebM videos.
            `;
        } else if (videoSrc.toLowerCase().includes('.ogg')) {
            videoElement.innerHTML = `
                <source src="${escapeHtml(videoSrc)}" type="video/ogg">
                Your browser does not support OGG videos.
            `;
        } else {
            // Generic fallback
            videoElement.src = escapeHtml(videoSrc);
        }
        
        // Error handling
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
        // Parse content - format: "timer_seconds:image1.jpg\nimage2.jpg" or just "image1.jpg\nimage2.jpg"
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            container.innerHTML = '<div class="empty-text">No images provided for slideshow</div>';
            return;
        }
        
        // Check if first line contains timer setting
        let slideTimer = 5000; // Default 5 seconds
        let imageStartIndex = 0;
        
        if (lines[0].includes(':') && lines[0].match(/^\d+:/)) {
            // First line contains timer setting like "3:image.jpg" or just "8:"
            const timerMatch = lines[0].match(/^(\d+):/);
            if (timerMatch) {
                slideTimer = parseInt(timerMatch[1]) * 1000; // Convert to milliseconds
                // If there's an image after the colon, include it
                const remainingPart = lines[0].substring(timerMatch[0].length).trim();
                if (remainingPart) {
                    lines[0] = remainingPart; // Replace first line with just the image part
                } else {
                    imageStartIndex = 1; // Skip the timer-only line
                }
            }
        }
        
        // Get image list starting from the correct index
        const imageList = lines.slice(imageStartIndex).filter(url => url.trim());
        
        if (imageList.length === 0) {
            container.innerHTML = '<div class="empty-text">No images provided for slideshow</div>';
            return;
        }
        
        // Process image URLs/paths and handle spaces
        const processedImages = imageList.map(url => {
            const trimmedUrl = url.trim();
            if (!trimmedUrl.startsWith('http') && !trimmedUrl.startsWith('/')) {
                // Local file path - encode spaces and convert to static URL
                const encodedFilename = encodeURIComponent(trimmedUrl);
                return `/static/uploads/${encodedFilename}`;
            }
            // For URLs, encode the entire URL to handle spaces
            return encodeURI(trimmedUrl);
        });
        
        // Create slideshow container
        container.innerHTML = `
            <div class="slideshow-container" id="slideshow-${index}">
                <img class="slideshow-image" alt="Slideshow Image" />
                <div class="slideshow-timer-indicator" style="display: none; opacity: 0;">
                    <span>${slideTimer / 1000}s</span>
                </div>
            </div>
        `;
        
        // Start slideshow with custom timer
        startSlideshow(index, processedImages, slideTimer);
    } else {
        container.innerHTML = `
            <div class="empty-text">No slideshow content provided</div>
        `;
    }
}

function startClock() {
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    
    // Fallback time formatting if signageApp is not available
    const formatTime24 = (date) => date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const formatTime12 = (date) => date.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const formatDateFull = (date) => date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const formatDateShort = (date) => date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const formatDateNumeric = (date) => date.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const formatDateISO = (date) => date.toISOString().split('T')[0];
    
    // Update top bar (always 24h format)
    document.getElementById('currentTime').textContent = formatTime24(now);
    document.getElementById('currentDate').textContent = formatDateFull(now);
    
    // Update clock widgets with their specific formatting
    const clockElements = document.querySelectorAll('.widget-clock');
    clockElements.forEach(widget => {
        const timeFormat = widget.dataset.timeFormat || '24h';
        const dateFormat = widget.dataset.dateFormat || 'full';
        
        const clockTime = widget.querySelector('.clock-time');
        const clockDate = widget.querySelector('.clock-date');
        
        if (clockTime) {
            clockTime.textContent = timeFormat === '12h' ? formatTime12(now) : formatTime24(now);
        }
        
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

function startTimer(index, totalSeconds) {
    let remainingSeconds = totalSeconds;
    const warningThreshold = Math.min(60, totalSeconds * 0.2); // 20% or 60 seconds
    const dangerThreshold = Math.min(10, totalSeconds * 0.05); // 5% or 10 seconds

    const updateTimer = () => {
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        const timerElement = document.getElementById(`timer-${index}`);
        if (timerElement) {
            timerElement.textContent = display;

            // Update visual state based on remaining time
            timerElement.classList.remove('timer-warning', 'timer-danger');
            if (remainingSeconds <= dangerThreshold && remainingSeconds > 0) {
                timerElement.classList.add('timer-danger');
            } else if (remainingSeconds <= warningThreshold && remainingSeconds > 0) {
                timerElement.classList.add('timer-warning');
            }

            if (remainingSeconds <= 0) {
                timerElement.classList.add('timer-danger');
                timerElement.textContent = '00:00';
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
                // Skip to next image on error
                currentImageIndex = (currentImageIndex + 1) % images.length;
                setTimeout(showNextImage, 100);
                return;
            };

            currentImageIndex = (currentImageIndex + 1) % images.length;
        }, 400); // Transition time
    };

    // Show first image immediately
    showNextImage();

    // Only start interval if there are multiple images
    if (images.length > 1) {
        slideshowIntervals[index] = setInterval(showNextImage, slideTimer);
    }
}

async function loadRSSFeed(feedUrl, index) {
    try {
        const response = await fetch(`/api/rss?url=${encodeURIComponent(feedUrl)}`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        const container = document.getElementById(`rss-content-${index}`);
        const titleElement = container.parentElement.querySelector('.rss-title');
        
        if (titleElement) {
            titleElement.textContent = data.title || 'RSS Feed';
        }
        
        let html = '';
        data.items.forEach(item => {
            html += `
                <div class="rss-item">
                    <div class="rss-item-title">${escapeHtml(item.title)}</div>
                    <div class="rss-item-description">${truncateText(stripHtml(item.description), 200)}</div>
                    ${item.published ? `<div class="rss-item-date">${formatRSSDate(item.published)}</div>` : ''}
                </div>
            `;
        });
        
        container.innerHTML = html;
        rssCache[feedUrl] = { data, timestamp: Date.now() };
        
    } catch (error) {
        console.error('RSS loading error:', error);
        const container = document.getElementById(`rss-content-${index}`);
        if (container) {
            container.innerHTML = `<div class="rss-error">Failed to load RSS feed</div>`;
        }
    }
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

function refreshDisplay() {
    // Clear all intervals before reload
    if (clockInterval) {
        clearInterval(clockInterval);
    }
    
    Object.values(timerIntervals).forEach(interval => {
        clearInterval(interval);
    });
    
    Object.values(slideshowIntervals).forEach(interval => {
        clearInterval(interval);
    });
    
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
            element.style.webkitBackdropFilter = `blur(${blurAmount}px)`; // Safari support
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

// Utility functions
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

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (clockInterval) {
        clearInterval(clockInterval);
    }
    
    Object.values(timerIntervals).forEach(interval => {
        clearInterval(interval);
    });
    
    Object.values(slideshowIntervals).forEach(interval => {
        clearInterval(interval);
    });
});
