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
    const BASE_LERP     = 0.105;   // lower = smoother, higher = more responsive
    const MAX_DPR       = 2;       // crisp canvas without wasting too much memory
    const MOBILE_QUERY  = window.matchMedia('(max-width: 640px)');

    // ── State ───────────────────────────────────────────────
    const frames        = [];
    let   loadedCount   = 0;
    let   targetFrame   = 0;       // where scroll wants us to be (float)
    let   smoothFrame   = 0;       // current interpolated position (float)
    let   lastRendered  = -1;      // last actually drawn frame index
    let   animating     = false;
    let   allLoaded     = false;
    let   viewportW     = 0;
    let   viewportH     = 0;
    let   resizeRaf     = 0;
    let   scrollMetrics = null;
    let   lastScrollY   = window.scrollY || 0;
    let   scrollingUp   = false;

    // ── DOM ─────────────────────────────────────────────────
    const canvas       = document.getElementById('droneCanvas');
    const ctx          = canvas ? canvas.getContext('2d') : null;
    const scrollHero   = document.getElementById('scrollHero');
    const navbar       = document.getElementById('navbar');
    const loadingBar   = document.getElementById('loadingBar');
    const loadingFill  = document.getElementById('loadingFill');
    const loadingText  = document.getElementById('loadingText');
    const scrollCue    = document.getElementById('scrollCue');
    const hamburger    = document.getElementById('hamburger');

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
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        viewportW = document.documentElement.clientWidth || window.innerWidth;
        viewportH = window.visualViewport ? Math.round(window.visualViewport.height) : window.innerHeight;
        canvas.width  = Math.round(viewportW * dpr);
        canvas.height = Math.round(viewportH * dpr);
        canvas.style.width = viewportW + 'px';
        canvas.style.height = viewportH + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        lastRendered = -1; // force re-render after resize
        scrollMetrics = null;
        renderFrame(Math.round(smoothFrame), true);
    }

    // ── Draw a frame to canvas (cover-fit) ──────────────────
    function renderFrame(idx, force = false) {
        idx = getNearestLoadedFrame(Math.max(0, Math.min(TOTAL_FRAMES - 1, idx)));
        if (!force && idx === lastRendered) return;
        const img = frames[idx];
        if (!img || !img.complete || img.naturalWidth === 0) return;

        const cW = viewportW || window.innerWidth;
        const cH = viewportH || window.innerHeight;
        const iW = img.naturalWidth, iH = img.naturalHeight;

        const scale = Math.max(cW / iW, cH / iH);
        const dW = iW * scale, dH = iH * scale;
        const dx = (cW - dW) / 2, dy = (cH - dH) / 2;

        ctx.clearRect(0, 0, cW, cH);
        ctx.drawImage(img, dx, dy, dW, dH);
        lastRendered = idx;
    }

    function getNearestLoadedFrame(idx) {
        if (frames[idx] && frames[idx].complete && frames[idx].naturalWidth > 0) return idx;
        for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
            const before = idx - offset;
            const after = idx + offset;
            if (before >= 0 && frames[before] && frames[before].complete && frames[before].naturalWidth > 0) return before;
            if (after < TOTAL_FRAMES && frames[after] && frames[after].complete && frames[after].naturalWidth > 0) return after;
        }
        return idx;
    }

    function getScrollMetrics() {
        if (!scrollMetrics) {
            scrollMetrics = {
                sectionTop: scrollHero.offsetTop,
                maxScroll: Math.max(1, scrollHero.offsetHeight - viewportH)
            };
        }
        return scrollMetrics;
    }

    // ── Scroll → target frame index ─────────────────────────
    function getFrameFromScroll() {
        const metrics = getScrollMetrics();

        const scrolled  = Math.max(0, window.scrollY - metrics.sectionTop);
        const progress = Math.min(scrolled / metrics.maxScroll, 1);

        return Math.min(progress * (TOTAL_FRAMES - 1), TOTAL_FRAMES - 1);
    }

    // ── Smooth animation loop (runs at 60fps) ───────────────
    function animationLoop() {
        // Lerp toward target
        const delta = targetFrame - smoothFrame;
        const directionalBoost = scrollingUp ? 0.045 : 0;
        const adaptiveLerp = Math.min(0.26, BASE_LERP + directionalBoost + Math.abs(delta) * 0.0022);
        smoothFrame += delta * adaptiveLerp;

        // Snap when very close to avoid infinite micro-updates
        if (Math.abs(smoothFrame - targetFrame) < 0.05) {
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
        const currentScrollY = window.scrollY || 0;
        scrollingUp = currentScrollY < lastScrollY;
        lastScrollY = currentScrollY;
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
                resizeCanvas();
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

        // Load keyframes first so fast scrolls still have nearby frames.
        const queue = [];
        for (let i = 1; i < TOTAL_FRAMES; i += 4) queue.push(i);
        for (let i = 2; i < TOTAL_FRAMES; i += 4) queue.push(i);
        for (let i = 3; i < TOTAL_FRAMES; i += 4) queue.push(i);
        for (let i = 4; i < TOTAL_FRAMES; i += 4) queue.push(i);

        let i = 0;
        function step() {
            if (i >= queue.length) return;
            loadImage(queue[i]);
            i++;
            // Batch lightly to avoid decoding jank on the main thread.
            if (i % 6 === 0) {
                requestAnimationFrame(step);
            } else {
                step();
            }
        }
        requestAnimationFrame(step);
    }

    function initMobileMenu() {
        if (!hamburger || !navbar) return;
        hamburger.addEventListener('click', () => {
            const isOpen = navbar.classList.toggle('menu-open');
            hamburger.setAttribute('aria-expanded', String(isOpen));
        });
        document.querySelectorAll('.nav-links a, .nav-actions button').forEach(item => {
            item.addEventListener('click', () => {
                navbar.classList.remove('menu-open');
                hamburger.setAttribute('aria-expanded', 'false');
            });
        });
    }

    function escapeNoticeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function formatNoticeDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    async function loadHomepageNotices() {
        const list = document.getElementById('homeNoticesList');
        if (!list || !window.HostelAPI) return;

        try {
            const notices = await window.HostelAPI.getNotices();
            const allNotices = notices || [];
            let homepageNotices = allNotices.filter(notice => {
                const audience = String(notice.Audience || notice.audience || '').trim().toLowerCase();
                return ['homepage', 'home page', 'home', 'latest', 'latest updates', 'updates', 'both', 'all'].includes(audience);
            }).slice(0, 3);

            if (!homepageNotices.length) {
                homepageNotices = allNotices.filter(notice => {
                    const audience = String(notice.Audience || notice.audience || '').trim();
                    return !audience;
                }).slice(0, 3);
            }

            if (!homepageNotices.length) return;

            list.innerHTML = homepageNotices.map((notice, index) => {
                const title = notice.Title || notice.title || 'Hostel update';
                const body = notice.Body || notice.content || notice.body || '';
                const date = formatNoticeDate(notice.PostedAt || notice.Date || notice.date || '');
                return `
                    <div class="notice-item">
                        <span class="notice-badge ${index === 0 ? 'new' : ''}">${index === 0 ? 'New' : 'Info'}</span>
                        <div>
                            <h4>${escapeNoticeHTML(title)}</h4>
                            <p>${escapeNoticeHTML(body)}</p>
                        </div>
                        <span class="notice-date">${escapeNoticeHTML(date)}</span>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.warn('[Notices] Could not load homepage notices.', error);
        }
    }

    // ── Init ─────────────────────────────────────────────────
    function init() {
        resizeCanvas();

        // Draw dark placeholder while loading
        ctx.fillStyle = '#0a0c1a';
        ctx.fillRect(0, 0, viewportW, viewportH);

        // Event listeners
        window.addEventListener('resize',  () => {
            cancelAnimationFrame(resizeRaf);
            resizeRaf = requestAnimationFrame(resizeCanvas);
        }, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                cancelAnimationFrame(resizeRaf);
                resizeRaf = requestAnimationFrame(resizeCanvas);
            }, { passive: true });
        }
        window.addEventListener('scroll',  onScroll,     { passive: true });
        if (MOBILE_QUERY.addEventListener) {
            MOBILE_QUERY.addEventListener('change', resizeCanvas);
        }
        initMobileMenu();
        loadHomepageNotices();

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
