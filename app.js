'use strict';

/* ── Config ─────────────────────────────────────────────── */
const MEDIA_API_URL = 'https://api.github.com/repos/qyct/kadhira/contents/media';
const RAW_BASE_URL  = 'https://raw.githubusercontent.com/qyct/kadhira/main/media/';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.avi']);

/* ── DOM refs ────────────────────────────────────────────── */
const galleryEl      = document.getElementById('gallery');
const loadingEl      = document.getElementById('loading');
const errorEl        = document.getElementById('error');
const counterEl      = document.getElementById('counter');
const counterTextEl  = document.getElementById('counter-text');
const siteHeaderEl   = document.getElementById('site-header');

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

/* ── Media item factory ──────────────────────────────────── */
function buildImageItem(file, item) {
    const img = document.createElement('img');
    img.alt   = '';
    img.decoding = 'async';
    img.loading  = 'lazy';

    // Fade in on load
    img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
    img.src = RAW_BASE_URL + file.name;

    // Double-tap ripple
    let lastTap = 0;
    item.addEventListener('touchend', e => {
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
}

function buildVideoItem(file, item) {
    const video = document.createElement('video');
    video.src       = RAW_BASE_URL + file.name;
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

/* ── Counter ─────────────────────────────────────────────── */
function initCounter(total) {
    const items = () => document.querySelectorAll('.media-item');
    const update = () => {
        const i = currentIndex(items());
        counterTextEl.textContent = `${i + 1} / ${total}`;
    };
    galleryEl.addEventListener('scroll', update, { passive: true });
    update();
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
        initCounter(files.length);
        initSwipe(files.length);
        initKeyboard();
        if (files.length > 1) addScrollHint();

    } catch (err) {
        console.error('[kadhira]', err);
        dismissLoading();
        showError(err.message);
    }
}

fetchMedia();
