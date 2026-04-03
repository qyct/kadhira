# Kadhira

> A minimalist memory gallery — scroll through moments, one at a time.

## Media File Size Limits

**CRITICAL:** All media files must adhere to these size limits:

- **JPEG/PNG images:** Maximum 100KB per file
- **WebM videos:** Maximum 1MB per file
- **Other video formats (MP4, MOV, AVI, MKV):** Not allowed in repository (see `.gitignore`)

Files exceeding these limits will not be accepted. Use ImageMagick or FFmpeg to compress media before committing.

```bash
# Compress images
mogrify -quality 80 -resize 80% image.jpg

# Compress videos to WebM
ffmpeg -i input.mp4 -fs 900K -c:v libvpx -crf 45 -b:v 0 -c:a libopus -b:a 24k -ac 1 output.webm
```

## Overview

Kadhira is a static web application that displays a curated gallery of photos and videos. Media files are served directly from a GitHub repository, fetched via the GitHub Contents API, and rendered in a cinematic, scroll-based interface.

## Tech Stack

- **Vanilla JavaScript** — No frameworks, just the DOM
- **CSS3** — Custom properties, scroll snap, intersection observers
- **GitHub API** — Dynamic media fetching from repository contents
- **Web APIs** — Intersection Observer, Vibration, Touch Events
- **Deployment** — GitHub Pages (static hosting)

## Features

- **Scroll-based navigation** — Snap scrolling centers each media item
- **Auto-play videos** — Videos play when 55% visible, pause when scrolled away
- **Keyboard navigation** — Arrow keys to navigate between items
- **Swipe assist** — Touch gestures for mobile navigation
- **Haptic feedback** — Subtle taps on interactions (mobile)
- **Counter** — Shows current position (e.g., "1 / 50")
- **Film grain overlay** — Subtle texture for cinematic feel
- **Progress bars** — Video playback progress indicators
- **Loading state** — Animated dots while fetching media

## File Naming Convention

Media files should be numbered sequentially for proper sorting:

```
9941.jpg
9942.jpg
9943.webm
9944.jpg
...
```

The gallery sorts files in **descending order** by numeric prefix (newest first).

## Setup & Deployment

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/qyct/kadhira.git
cd kadhira
```

2. Serve the directory (any static server):
```bash
python3 -m http.server 8000
# or
npx serve
```

3. Open `http://localhost:8000`

### Adding Media

1. Place files in the `media/` directory
2. Ensure files meet size limits (see above)
3. Commit and push:
```bash
git add media/
git commit -m "Add memories: description"
git push
```

### GitHub Pages

The repository is configured to serve from the root directory. Changes are automatically deployed on push to `main`.

## Design Decisions

- **Dark theme** — Minimal distraction, focus on content
- **Typography** — Cormorant Garamond (serif) for elegance, DM Mono (monospace) for UI
- **No captions** — Let images speak for themselves
- **Looping videos** — Continuous playback for ambient viewing
- **Muted by default** — Videos start muted; users can unmute via controls
- **Lazy loading** — Images load on-demand for performance
- **Intersection thresholds** — 55% visibility for video auto-play
- **Safe area insets** — Proper spacing on mobile notches
- **Reduced motion support** — Respects `prefers-reduced-motion` preference

## Performance Notes

- Images use `decoding="async"` and `loading="lazy"`
- Videos preload metadata only
- Gallery renders into a document fragment before insertion
- Scroll and touch handlers use passive listeners where possible
- Animations use `transform` and `opacity` for GPU acceleration

## Browser Support

- Modern browsers with ES6+ support
- iOS Safari 14+ (haptic feedback, safe-area-inset)
- Android Chrome (vibration API)
- Desktop browsers (keyboard navigation)

## License

MIT — feel free to use for your own memory gallery.
