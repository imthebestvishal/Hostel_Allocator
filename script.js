/* ============================================
   script.js — Scroll Sequence Animation (v2)
   + Landing Page Interactions
   ============================================ */

// ── Global toast notification ─────────────────────────────────────────────
function showToast(message, type = 'info') {
    let toast = document.getElementById('globalToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'globalToast';
        toast.style.cssText = `
            position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%) translateY(20px);
            background: hsl(228,30%,10%); color: #fff; padding: .75rem 1.5rem;
            border-radius: 8px; font-family: Inter, sans-serif; font-size: .875rem; font-weight: 500;
            box-shadow: 0 8px 24px rgba(0,0,0,.2); z-index: 9999;
            opacity: 0; transition: all .3s cubic-bezier(.22,1,.36,1); pointer-events: none;
            white-space: nowrap;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    if (type === 'success') toast.style.borderLeft = '4px solid hsl(142,70%,40%)';
    else if (type === 'error') toast.style.borderLeft = '4px solid hsl(0,80%,55%)';
    else toast.style.borderLeft = '4px solid hsl(41,100%,47%)';

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 3000);
}

(function () {
    'use strict';

    // ── Config ──────────────────────────────────────────────
    const TOTAL_FRAMES  = 162;
    const FRAME_START   = 7;       // first file is frame_0007.jpg
    const IMAGE_PATH    = 'assets/sequence/';
    const EXT           = '.jpg';
    const LERP_SPEED    = 0.08;    // smoothing factor (0.05 = silky, 0.15 = snappy)

    // ── State ───────────────────────────────────────────────
    const frames        = [];
    let   loadedCount   = 0;
    let   targetFrame   = 0;       // where scroll wants us to be (integer)
    let   smoothFrame   = 0;       // current interpolated position (float)
    let   lastRendered  = -1;      // last actually drawn frame index
    let   animating     = false;
    let   allLoaded     = false;

    // ── DOM ─────────────────────────────────────────────────
    const canvas       = document.getElementById('droneCanvas');
    const ctx          = canvas ? canvas.getContext('2d') : null;
    const scrollHero   = document.getElementById('scrollHero');
    const navbar       = document.getElementById('navbar');
    const loadingBar   = document.getElementById('loadingBar');
    const loadingFill  = document.getElementById('loadingFill');
    const loadingText  = document.getElementById('loadingText');
    const scrollCue    = document.getElementById('scrollCue');

    if (!canvas || !ctx || !scrollHero) {
        console.error('[Sequence] Required DOM elements not found. Aborting.');
        return;
    }

    // ── Frame filename builder ──────────────────────────────
    function frameName(n) {
        return 'frame_' + String(n).padStart(4, '0');
    }

    // ── Resize canvas to fill viewport ──────────────────────
    function resizeCanvas() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        lastRendered = -1; // force re-render after resize
    }

    // ── Draw a frame to canvas (cover-fit) ──────────────────
    function renderFrame(idx) {
        if (idx === lastRendered) return;
        const img = frames[idx];
        if (!img || !img.complete || img.naturalWidth === 0) return;

        const cW = canvas.width,  cH = canvas.height;
        const iW = img.naturalWidth, iH = img.naturalHeight;

        const scale = Math.max(cW / iW, cH / iH);
        const dW = iW * scale, dH = iH * scale;
        const dx = (cW - dW) / 2, dy = (cH - dH) / 2;

        ctx.clearRect(0, 0, cW, cH);
        ctx.drawImage(img, dx, dy, dW, dH);
        lastRendered = idx;
    }

    // ── Scroll → target frame index ─────────────────────────
    function getFrameFromScroll() {
        const sectionTop   = scrollHero.offsetTop;
        const sectionH     = scrollHero.offsetHeight;
        const viewportH    = window.innerHeight;

        const scrolled  = Math.max(0, window.scrollY - sectionTop);
        const maxScroll = Math.max(1, sectionH - viewportH);
        const progress  = Math.min(scrolled / maxScroll, 1);

        return Math.min(Math.floor(progress * TOTAL_FRAMES), TOTAL_FRAMES - 1);
    }

    // ── Smooth animation loop (runs at 60fps) ───────────────
    function animationLoop() {
        // Lerp toward target
        smoothFrame += (targetFrame - smoothFrame) * LERP_SPEED;

        // Snap when very close to avoid infinite micro-updates
        if (Math.abs(smoothFrame - targetFrame) < 0.3) {
            smoothFrame = targetFrame;
        }

        const frameIdx = Math.round(smoothFrame);
        renderFrame(frameIdx);

        // Keep looping if we haven't converged
        if (Math.abs(smoothFrame - targetFrame) > 0.01) {
            requestAnimationFrame(animationLoop);
        } else {
            animating = false;
        }
    }

    function startAnimating() {
        if (!animating) {
            animating = true;
            requestAnimationFrame(animationLoop);
        }
    }

    // ── Scroll handler (lightweight — just sets target) ─────
    function onScroll() {
        targetFrame = getFrameFromScroll();
        startAnimating();

        // Hide scroll cue after initial scroll
        if (window.scrollY > 60) {
            if (scrollCue) scrollCue.style.opacity = '0';
        } else {
            if (scrollCue) scrollCue.style.opacity = '1';
        }

        // Navbar style
        if (window.scrollY > 20) {
            navbar && navbar.classList.add('scrolled');
        } else {
            navbar && navbar.classList.remove('scrolled');
        }
    }

    // ── Load images ─────────────────────────────────────────
    function loadImage(index) {
        const img  = new Image();
        img.decoding = 'async';

        img.onload = () => {
            frames[index] = img;
            loadedCount++;

            const pct = Math.round((loadedCount / TOTAL_FRAMES) * 100);
            if (loadingFill) loadingFill.style.width = pct + '%';
            if (loadingText) loadingText.textContent  = `Loading campus… ${pct}%`;

            // Draw frame 0 the moment it's ready
            if (index === 0) {
                canvas.width  = window.innerWidth;
                canvas.height = window.innerHeight;
                renderFrame(0);
            }

            // Re-render if this frame is the one we're trying to show
            if (index === Math.round(smoothFrame)) {
                lastRendered = -1;
                startAnimating();
            }

            if (loadedCount >= TOTAL_FRAMES) {
                allLoaded = true;
                if (loadingBar) {
                    loadingBar.style.transition = 'opacity .5s';
                    loadingBar.style.opacity = '0';
                    setTimeout(() => { if (loadingBar) loadingBar.style.display = 'none'; }, 600);
                }
            }
        };

        img.onerror = () => {
            console.warn(`[Sequence] Failed to load frame ${index + FRAME_START}`);
            frames[index] = { complete: false, naturalWidth: 0 };
            loadedCount++;
        };

        img.src = `${IMAGE_PATH}${frameName(index + FRAME_START)}${EXT}`;
    }

    // ── Progressive load — prioritise first frame, then rest ─
    function startLoading() {
        if (loadingBar) loadingBar.style.display = 'block';

        // Load frame 0 immediately
        loadImage(0);

        // Load the rest with a tiny stagger so the browser isn't choked
        let i = 1;
        function step() {
            if (i >= TOTAL_FRAMES) return;
            loadImage(i);
            i++;
            // Batch 8 at a time, pause 1 frame between batches
            if (i % 8 === 0) {
                requestAnimationFrame(step);
            } else {
                step();
            }
        }
        requestAnimationFrame(step);
    }

    // ── Init ─────────────────────────────────────────────────
    function init() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;

        // Draw dark placeholder while loading
        ctx.fillStyle = '#0a0c1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Event listeners
        window.addEventListener('resize',  resizeCanvas, { passive: true });
        window.addEventListener('scroll',  onScroll,     { passive: true });

        // Start loading frames
        startLoading();
    }

    // ── Wait for DOM ─────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
