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
    const TOTAL_FRAMES  = 56;
    const IMAGE_PATH    = 'assets/sequence/';
    const EXT           = '.jpg';

    // ── State ───────────────────────────────────────────────
    const frames        = [];   // HTMLImageElement | null
    let   loadedCount   = 0;
    let   currentFrame  = 0;
    let   rafId         = null;
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

    // ── Pad frame number to 5 digits ─────────────────────────
    function padded(n) {
        return String(n).padStart(5, '0');
    }

    // ── Resize canvas to fill viewport ──────────────────────
    function resizeCanvas() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        renderFrame(currentFrame);
    }

    // ── Draw a frame to canvas (cover-fit) ──────────────────
    function renderFrame(idx) {
        const img = frames[idx];
        if (!img || !img.complete || img.naturalWidth === 0) return;

        const cW = canvas.width,  cH = canvas.height;
        const iW = img.naturalWidth, iH = img.naturalHeight;

        // CSS object-fit: cover equivalent
        const scale = Math.max(cW / iW, cH / iH);
        const dW = iW * scale, dH = iH * scale;
        const dx = (cW - dW) / 2, dy = (cH - dH) / 2;

        ctx.clearRect(0, 0, cW, cH);
        ctx.drawImage(img, dx, dy, dW, dH);
    }

    // ── Scroll → frame index ─────────────────────────────────
    function getFrameFromScroll() {
        const rect         = scrollHero.getBoundingClientRect();
        const sectionTop   = scrollHero.offsetTop;
        const sectionH     = scrollHero.offsetHeight;
        const viewportH    = window.innerHeight;

        // How far we have scrolled into this section (0 … sectionH - viewportH)
        const scrolled  = Math.max(0, window.scrollY - sectionTop);
        const maxScroll = Math.max(1, sectionH - viewportH);
        const progress  = Math.min(scrolled / maxScroll, 1);

        return Math.min(Math.floor(progress * TOTAL_FRAMES), TOTAL_FRAMES - 1);
    }

    // ── Scroll handler ──────────────────────────────────────
    function onScroll() {
        const idx = getFrameFromScroll();

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

        if (idx === currentFrame) return;
        currentFrame = idx;

        // Cancel any pending frame, schedule a new one
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            renderFrame(currentFrame);
            rafId = null;
        });
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

            // Also re-render current frame if it just loaded
            if (index === currentFrame) {
                cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => renderFrame(currentFrame));
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
            console.warn(`[Sequence] Failed to load frame ${index + 1}`);
            // Put a dummy so we don't retry
            frames[index] = { complete: false, naturalWidth: 0 };
            loadedCount++;
        };

        img.src = `${IMAGE_PATH}${padded(index + 1)}${EXT}`;
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
            // Batch 6 at a time, pause 1 frame between batches
            if (i % 6 === 0) {
                requestAnimationFrame(step);
            } else {
                step();
            }
        }
        requestAnimationFrame(step);
    }

    // ── Init ─────────────────────────────────────────────────
    function init() {
        // Set initial canvas size
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
