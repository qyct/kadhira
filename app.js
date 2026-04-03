'use strict';

/* ── Config ─────────────────────────────────────────────── */
const MEDIA_API_URL = 'https://api.github.com/repos/qyct/kadhira/contents/media';
const RAW_BASE_URL  = 'https://raw.githubusercontent.com/qyct/kadhira/main/media/';
const LS_KEY        = 'kadhira_last_index';
const LS_JUMP_KEY   = 'kadhira_last_jump_value';
const LS_FILE_NUM_KEY = 'kadhira_last_file_number';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.avi']);

/* ── DOM refs ────────────────────────────────────────────── */
const galleryEl      = document.getElementById('gallery');
const loadingEl      = document.getElementById('loading');
const errorEl        = document.getElementById('error');
const counterEl      = document.getElementById('counter');
const counterTextEl  = document.getElementById('counter-text');
const siteHeaderEl   = document.getElementById('site-header');
const jumpOverlayEl  = document.getElementById('jump-overlay');
const jumpInputEl    = document.getElementById('jump-input');
const jumpBtnEl      = document.getElementById('jump-btn');
const jumpCancelEl   = document.getElementById('jump-cancel');
const jumpErrorEl    = document.getElementById('jump-error');

/* ── Helpers ─────────────────────────────────────────────── */
const ext = name => '.' + name.split('.').pop().toLowerCase();
const isImage = name => IMAGE_EXT.has(ext(name));
const isVideo = name => VIDEO_EXT.has(ext(name));
const extractNum = name => { const m = name.match(/^(\d+)/); return m ? +m[1] : 0; };

/** Light haptic tap — silent if not supported */
function haptic(ms = 10) {
    try { navigator.vibrate?.(ms); } catch (_) {}
}

/** Spawn a radial ripple at (x, y) relative to parent */
function spawnRipple(x, y, parent) {
    const el = document.createElement('div');
    el.className = 'tap-ripple';
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    parent.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
}

/** Return index of the item most centered in viewport */
function currentIndex(items) {
    const mid = window.innerHeight / 2;
    let best = 0, bestDist = Infinity;
    items.forEach((item, i) => {
        const rect = item.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - mid);
        if (dist < bestDist) { bestDist = dist; best = i; }
    });
    return best;
}

/* ── Pinch-zoom & rotate for images ──────────────────────── */
function initPinchZoom(img, item) {
    let scale = 1, rot = 0;
    let startDist = 0, startAngle = 0;
    let startScale = 1, startRot = 0;
    let originX = 50, originY = 50; // percent
    let isPinching = false;
    let resetTimer;

    function getTouches(e) { return Array.from(e.touches); }

    function midpoint(t1, t2) {
        return {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
        };
    }

    function dist(t1, t2) {
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function angle(t1, t2) {
        return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI;
    }

    function applyTransform(animated) {
        img.style.transition = animated ? 'transform 0.35s cubic-bezier(0.22,1,0.36,1)' : 'none';
        img.style.transformOrigin = `${originX}% ${originY}%`;
        img.style.transform = `scale(${scale}) rotate(${rot}deg)`;
    }

    function scheduleReset() {
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
            scale = 1; rot = 0; originX = 50; originY = 50;
            applyTransform(true);
            img.classList.remove('zoomed');
        }, 3000);
    }

    item.addEventListener('touchstart', e => {
        const touches = getTouches(e);
        if (touches.length !== 2) return;
        isPinching = true;
        clearTimeout(resetTimer);

        startDist  = dist(touches[0], touches[1]);
        startAngle = angle(touches[0], touches[1]);
        startScale = scale;
        startRot   = rot;

        // Set transform origin to pinch midpoint
        const mid = midpoint(touches[0], touches[1]);
        const rect = item.getBoundingClientRect();
        originX = ((mid.x - rect.left) / rect.width)  * 100;
        originY = ((mid.y - rect.top)  / rect.height) * 100;
        applyTransform(false);
    }, { passive: true });

    item.addEventListener('touchmove', e => {
        const touches = getTouches(e);
        if (touches.length !== 2 || !isPinching) return;
        e.stopPropagation();

        const newDist  = dist(touches[0], touches[1]);
        const newAngle = angle(touches[0], touches[1]);

        scale = Math.min(Math.max(startScale * (newDist / startDist), 0.8), 5);
        rot   = startRot + (newAngle - startAngle);

        img.classList.add('zoomed');
        applyTransform(false);
    }, { passive: true });

    item.addEventListener('touchend', e => {
        if (!isPinching) return;
        const touches = getTouches(e);
        if (touches.length < 2) {
            isPinching = false;
            if (scale <= 1.05) {
                scale = 1; rot = 0; originX = 50; originY = 50;
                applyTransform(true);
                img.classList.remove('zoomed');
            } else {
                scheduleReset();
            }
        }
    }, { passive: true });
}

/* ── Media item factory ──────────────────────────────────── */
function buildImageItem(file, item) {
    const img = document.createElement('img');
    img.alt   = '';
    img.decoding = 'async';
    img.loading  = 'lazy';

    // Set src directly - native lazy loading will handle when to load
    img.src = RAW_BASE_URL + file.name;

    // Fade in on load
    img.addEventListener('load', () => img.classList.add('loaded'), { once: true });

    // Fallback: if image is already cached/loaded, add loaded class immediately
    if (img.complete) {
        img.classList.add('loaded');
    }

    // Double-tap ripple
    let lastTap = 0;
    item.addEventListener('touchend', e => {
        if (img.classList.contains('zoomed')) return; // skip ripple while zoomed
        const now = Date.now();
        if (now - lastTap < 280) {
            haptic(18);
            const t = e.changedTouches[0];
            const r = item.getBoundingClientRect();
            spawnRipple(t.clientX - r.left, t.clientY - r.top, item);
        }
        lastTap = now;
    }, { passive: true });

    item.appendChild(img);
    initPinchZoom(img, item);
}

function buildVideoItem(file, item) {
    const video = document.createElement('video');
    video.src = RAW_BASE_URL + file.name;
    video.loop      = true;
    video.playsInline = true;
    video.muted     = false;
    video.preload   = 'metadata';

    /* Play overlay */
    const overlay = document.createElement('div');
    overlay.className = 'play-overlay';

    const btn = document.createElement('div');
    btn.className = 'play-btn';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', 'Play / Pause');
    overlay.appendChild(btn);

    /* Progress bar */
    const progressWrap = document.createElement('div');
    progressWrap.className = 'video-progress';
    const progressFill = document.createElement('div');
    progressFill.className = 'video-progress-fill';
    progressWrap.appendChild(progressFill);

    item.appendChild(video);
    item.appendChild(overlay);
    item.appendChild(progressWrap);

    /* Sync progress */
    let _raf;
    function syncProgress() {
        if (!video.paused && video.duration) {
            progressFill.style.width = (video.currentTime / video.duration * 100) + '%';
        }
        if (!video.paused) _raf = requestAnimationFrame(syncProgress);
    }

    video.addEventListener('play',  () => { _raf = requestAnimationFrame(syncProgress); });
    video.addEventListener('pause', () => { cancelAnimationFrame(_raf); });

    /* Toggle play/pause */
    let hideTimer;
    function togglePlay(e) {
        if (e.target === progressWrap || e.target === progressFill) return;
        haptic(12);
        if (video.paused) {
            video.play().catch(() => {});
            overlay.classList.add('hidden');
        } else {
            video.pause();
            overlay.classList.remove('hidden');
        }
    }

    overlay.addEventListener('click', togglePlay);

    /* Tap playing video → flash controls for 2 s */
    video.addEventListener('click', () => {
        if (!video.paused) {
            overlay.classList.remove('hidden');
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                if (!video.paused) overlay.classList.add('hidden');
            }, 2000);
        }
    });

    /* Reset on end */
    video.addEventListener('ended', () => {
        overlay.classList.remove('hidden');
        progressFill.style.width = '0%';
        cancelAnimationFrame(_raf);
    });

    /* Auto-play when scrolled into view */
    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                video.play().then(() => {
                    overlay.classList.add('hidden');
                }).catch(() => {});
            } else {
                video.pause();
                if (!video.ended) overlay.classList.remove('hidden');
            }
        });
    }, { threshold: 0.55 });

    io.observe(item);
}

function createMediaItem(file, index) {
    const item = document.createElement('div');
    item.className    = 'media-item';
    item.dataset.index = index;

    if (isImage(file.name)) buildImageItem(file, item);
    else if (isVideo(file.name)) buildVideoItem(file, item);

    return item;
}

/* ── Swipe-assist navigation ─────────────────────────────── */
function initSwipe(total) {
    let y0 = 0, t0 = 0;

    galleryEl.addEventListener('touchstart', e => {
        y0 = e.touches[0].clientY;
        t0 = Date.now();
    }, { passive: true });

    galleryEl.addEventListener('touchend', e => {
        const dy  = y0 - e.changedTouches[0].clientY;
        const vel = Math.abs(dy) / (Date.now() - t0);  // px/ms

        // Only assist on fast decisive swipes — snap scrolling handles the rest
        if (vel > 0.45 && Math.abs(dy) > 40) {
            const items = document.querySelectorAll('.media-item');
            const ci = currentIndex(items);
            const next = dy > 0
                ? Math.min(ci + 1, total - 1)
                : Math.max(ci - 1, 0);
            if (next !== ci) {
                haptic(8);
                items[next]?.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }, { passive: true });
}

/* ── Keyboard navigation ─────────────────────────────────── */
function initKeyboard() {
    document.addEventListener('keydown', e => {
        const items = document.querySelectorAll('.media-item');
        const ci = currentIndex(items);
        let target = -1;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') target = Math.min(ci + 1, items.length - 1);
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') target = Math.max(ci - 1, 0);
        if (target >= 0 && target !== ci) {
            e.preventDefault();
            items[target]?.scrollIntoView({ behavior: 'smooth' });
        }
    });
}

/* ── Persist current index ───────────────────────────────── */
function saveIndex(i) {
    try { localStorage.setItem(LS_KEY, String(i)); } catch (_) {}
}

/* ── Persist current file number ─────────────────────────── */
function saveFileNumber(index) {
    try {
        if (_allFiles.length > 0 && index >= 0 && index < _allFiles.length) {
            const filename = _allFiles[index].name;
            const match = filename.match(/^(\d{4})/);
            if (match) {
                localStorage.setItem(LS_FILE_NUM_KEY, match[1]);
            }
        }
    } catch (_) {}
}

/* ── Counter ─────────────────────────────────────────────── */
function initCounter(total) {
    const getItems = () => document.querySelectorAll('.media-item');
    let lastSaved = -1;
    let saveTimeout;

    const update = () => {
        const i = currentIndex(getItems());
        counterTextEl.textContent = `${i + 1} / ${total}`;

        // Debounce save to wait for scroll to settle
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            if (i !== lastSaved) {
                lastSaved = i;
                saveIndex(i);
                saveFileNumber(i);
            }
        }, 300);
    };

    galleryEl.addEventListener('scroll', update, { passive: true });

    // Also save when tab is hidden / app backgrounded on mobile
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            const i = currentIndex(getItems());
            saveIndex(i);
            saveFileNumber(i);
        }
    });

    update();
}

/* ── Jump to file number ─────────────────────────────────── */
let _allFiles = [];

function openJump() {
    jumpErrorEl.textContent = '';

    // Try to load current file number first
    try {
        const currentFileNum = localStorage.getItem(LS_FILE_NUM_KEY);
        if (currentFileNum) {
            jumpInputEl.value = currentFileNum;
        } else {
            // Fallback to current index position
            const items = document.querySelectorAll('.media-item');
            const currentIdx = currentIndex(items);
            jumpInputEl.value = String(currentIdx + 1).padStart(4, '0');
        }
    } catch (_) {
        jumpInputEl.value = '';
    }

    jumpOverlayEl.classList.add('visible');
    setTimeout(() => jumpInputEl.focus(), 60);
}

function closeJump() {
    jumpOverlayEl.classList.remove('visible');
    jumpInputEl.blur();
}

function doJump() {
    const raw = jumpInputEl.value.trim();
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 1 || num > 9999) {
        jumpErrorEl.textContent = 'Enter a number between 0001 – 9999';
        return;
    }
    const padded = String(num).padStart(4, '0');
    // Find any file starting with that number
    const idx = _allFiles.findIndex(f => f.name.startsWith(padded));
    if (idx === -1) {
        // No file found - close overlay and stay on current item
        closeJump();
        return;
    }
    closeJump();
    const items = document.querySelectorAll('.media-item');
    items[idx]?.scrollIntoView({ behavior: 'smooth' });
}

function initJump(files) {
    _allFiles = files;

    // Counter tap opens jump overlay
    counterEl.style.cursor = 'pointer';
    counterEl.addEventListener('click', openJump);

    jumpBtnEl.addEventListener('click', doJump);
    jumpCancelEl.addEventListener('click', closeJump);

    jumpInputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') doJump();
        if (e.key === 'Escape') closeJump();
    });

    // Only allow digits, max 4
    jumpInputEl.addEventListener('input', () => {
        jumpInputEl.value = jumpInputEl.value.replace(/\D/g, '').slice(0, 4);
        jumpErrorEl.textContent = '';
        // Save current value to localStorage
        try {
            localStorage.setItem(LS_JUMP_KEY, jumpInputEl.value);
        } catch (_) {}
    });

    // Backdrop tap closes
    jumpOverlayEl.addEventListener('click', e => {
        if (e.target === jumpOverlayEl) closeJump();
    });
}

/* ── Restore last-seen position ──────────────────────────── */
function restorePosition(items) {
    try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved !== null) {
            const idx = parseInt(saved, 10);
            if (!isNaN(idx) && idx >= 0 && idx < items.length) {
                // Double rAF: first frame commits DOM, second frame has layout.
                // Use galleryEl.scrollTop directly — more reliable than
                // scrollIntoView on scroll-snap containers before first paint.
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const target = items[idx];
                        if (target) {
                            galleryEl.scrollTop = target.offsetTop;

                            // Force load nearby images by changing loading="lazy" to "eager"
                            const startIdx = Math.max(0, idx - 2);
                            const endIdx = Math.min(items.length - 1, idx + 2);
                            for (let i = startIdx; i <= endIdx; i++) {
                                const img = items[i].querySelector('img');
                                if (img) {
                                    img.loading = 'eager';
                                }
                            }
                        }
                    });
                });
                return true;
            }
        }
    } catch (_) {}
    return false;
}

/* ── Scroll hint ─────────────────────────────────────────── */
function addScrollHint() {
    const hint = document.createElement('div');
    hint.className = 'scroll-hint';
    hint.innerHTML =
        '<div class="scroll-hint-chevron"></div>' +
        '<span class="scroll-hint-label">scroll</span>';
    document.body.appendChild(hint);

    galleryEl.addEventListener('scroll', () => {
        hint.classList.add('hide');
        setTimeout(() => hint.remove(), 450);
    }, { once: true, passive: true });
}

/* ── Dismiss loading overlay ─────────────────────────────── */
function dismissLoading() {
    loadingEl.classList.add('fade-out');
    setTimeout(() => { loadingEl.style.display = 'none'; }, 750);
}

/* ── Show error ──────────────────────────────────────────── */
function showError(msg) {
    errorEl.innerHTML =
        '<span class="error-title">Something went wrong</span>' + msg;
    errorEl.style.display = 'block';
}

/* ── Main ────────────────────────────────────────────────── */
async function fetchMedia() {
    try {
        const res = await fetch(MEDIA_API_URL);
        if (!res.ok) throw new Error(`GitHub API responded with ${res.status}`);

        const data = await res.json();
        if (data.message) throw new Error(data.message);

        const files = data
            .filter(f => f.type === 'file' && (isImage(f.name) || isVideo(f.name)))
            .sort((a, b) => extractNum(b.name) - extractNum(a.name));

        dismissLoading();

        if (files.length === 0) {
            galleryEl.innerHTML = '<div class="empty-state">No memories yet</div>';
            return;
        }

        /* Render items */
        const fragment = document.createDocumentFragment();
        files.forEach((file, i) => fragment.appendChild(createMediaItem(file, i)));
        galleryEl.appendChild(fragment);

        /* Show UI chrome */
        counterEl.style.display  = 'block';
        siteHeaderEl.classList.add('visible');

        /* Wire up interactions */
        const itemEls = document.querySelectorAll('.media-item');
        initCounter(files.length);
        initSwipe(files.length);
        initKeyboard();
        initJump(files);
        if (files.length > 1) addScrollHint();

        /* Restore last-seen position */
        restorePosition(itemEls);

        // If no position to restore, native lazy loading will handle it
        // The first image(s) will load naturally as they enter the viewport

    } catch (err) {
        console.error('[kadhira]', err);
        dismissLoading();
        showError(err.message);
    }
}

fetchMedia();
