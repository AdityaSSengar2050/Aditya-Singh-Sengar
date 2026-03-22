/* ═══════════════════════════════════════════════════════════
   script.js — Single-canvas scrollytelling engine

   Architecture:
   ─ ONE scroll container (height = N × 100vh)
   ─ ONE sticky viewport (100vh)
   ─ ONE canvas that plays all 91 frames end-to-end
   ─ THREE chapter overlays that JS fades in/out based on
     which "zone" of the scroll range we're in.

   Zones (each zone = ZONE_VH × 100vh of scroll travel):
     Zone 0  (0   – 33%) → Hero
     Zone 1  (33% – 66%) → Who I Am
     Zone 2  (66% – 100%)→ Skills / My Work

   Within each zone:
     0%–15%  → fade in
     15%–85% → hold at full opacity
     85%–100%→ fade out
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── CONFIG ──────────────────────────────────────────── */
  const TOTAL_FRAMES  = 91;
  const FRAME_DIR     = 'frames1';
  // Scroll-height multiplier per chapter (set in VH units in CSS too)
  // Total container = CHAPTERS × ZONE_VH × 100vh
  const ZONE_VH       = 3;     // each chapter occupies 3 viewport heights of scroll
  const CHAPTERS      = 3;
  // Chapter definitions: which frames each zone uses
  const CHAPTER_DEF = [
    { id: 'ch-hero',   f0:  0, f1: 30 },
    { id: 'ch-about',  f0: 30, f1: 60 },
    { id: 'ch-skills', f0: 60, f1: 90 },
  ];
  // Fraction of a zone used for fade-in / fade-out on chapter overlays
  const FADE_IN  = 0.15;
  const FADE_OUT = 0.15;

  /* ─── DOM ─────────────────────────────────────────────── */
  const container  = document.getElementById('scrolly');
  const canvas     = document.getElementById('main-canvas');
  const ctx        = canvas.getContext('2d');
  const loader     = document.getElementById('loader');
  const scrollCue  = document.getElementById('scroll-cue');

  const chapters = CHAPTER_DEF.map(def => ({
    ...def,
    el: document.getElementById(def.id),
  }));

  /* ─── STATE ───────────────────────────────────────────── */
  const images   = new Array(TOTAL_FRAMES);
  let loadedCount = 0;
  let isReady     = false;
  let ticking     = false;
  let lastFrame   = -1;

  /* ─── SET CONTAINER HEIGHT ────────────────────────────── */
  function setHeight() {
    container.style.height = `${CHAPTERS * ZONE_VH * 100}vh`;
  }
  setHeight();

  /* ─── PRELOAD FRAMES ──────────────────────────────────── */
  const frameSrc = i =>
    `${FRAME_DIR}/ezgif-frame-${String(i).padStart(3, '0')}.png`;

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const img = new Image();
    img.src = frameSrc(i + 1);
    img.onload = img.onerror = () => {
      loadedCount++;
      if (loadedCount === TOTAL_FRAMES) onAllLoaded();
    };
    images[i] = img;
  }

  function onAllLoaded() {
    isReady = true;
    loader.classList.add('hidden');
    sizeCanvas();
    // Start with hero visible immediately
    chapters[0].el.style.opacity = '1';
    chapters[0].el.classList.add('active');
    renderFrame(0);
    onScroll();
  }

  /* ─── CANVAS SIZING ───────────────────────────────────── */
  function sizeCanvas() {
    canvas.width  = canvas.offsetWidth  || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;
  }

  /* ─── RENDER FRAME ────────────────────────────────────── */
  function renderFrame(idx) {
    const i = Math.max(0, Math.min(Math.round(idx), TOTAL_FRAMES - 1));
    if (i === lastFrame) return;
    lastFrame = i;

    const img = images[i];
    if (!img || !img.complete || !img.naturalWidth) return;

    const scale = Math.max(
      canvas.width  / img.naturalWidth,
      canvas.height / img.naturalHeight
    );
    const x = (canvas.width  - img.naturalWidth  * scale) / 2;
    const y = (canvas.height - img.naturalHeight * scale) / 2 + 150; // +150px pushes frame down, clearing the navbar
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
  }

  /* ─── HELPERS ─────────────────────────────────────────── */
  const clamp01 = t => Math.min(1, Math.max(0, t));
  const smooth  = t => t * t * (3 - 2 * t);  // cubic smooth-step

  /* ─── MAIN SCROLL HANDLER ─────────────────────────────── */
  function onScroll() {
    if (!isReady) return;
    if (ticking) return;
    ticking = true;

    requestAnimationFrame(() => {
      const rect       = container.getBoundingClientRect();
      const scrollable = container.offsetHeight - window.innerHeight;
      const globalP    = clamp01(-rect.top / scrollable);

      /* ── 1. CANVAS: map globalP to frame index ── */
      const eased    = smooth(globalP);
      const frameIdx = eased * (TOTAL_FRAMES - 1);
      renderFrame(frameIdx);

      // Reset canvas opacity if it was manipulated
      if (canvas) canvas.style.opacity = '1';

      /* ── 2. CHAPTER OPACITIES ── */
      const zoneSize = 1 / CHAPTERS; 

      chapters.forEach((ch, ci) => {
        const zoneStart = ci * zoneSize;
        const zP = clamp01((globalP - zoneStart) / zoneSize);

        let opacity;
        if (ci === 0) {
          // Hero: starts visible, fades out as zone ends
          opacity = 1 - clamp01((zP - (1 - FADE_OUT)) / FADE_OUT);
          if (globalP < 0.02) opacity = 1;

          // Also reset the transform/opacity of the heroInner text if it was SCRUBBED
          const heroInner = ch.el.querySelector('.hero-text');
          if (heroInner) {
            heroInner.style.transform = '';
            heroInner.style.opacity = '';
          }
        } else {
          if      (zP < FADE_IN)              opacity = clamp01(zP / FADE_IN);
          else if (zP > (1 - FADE_OUT))       opacity = clamp01((1 - zP) / FADE_OUT);
          else                                opacity = 1;
        }

        ch.el.style.opacity = opacity;
        if (opacity > 0.05) ch.el.classList.add('active');
        else                ch.el.classList.remove('active');
      });

      /* ── 3. SCROLL CUE ── */
      if (scrollCue) {
        scrollCue.style.opacity = globalP > 0.92 ? '0' : '1';
      }
      
      ticking = false;
    });
  }

  /* ─── EVENT LISTENERS ─────────────────────────────────── */
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    setHeight();
    sizeCanvas();
    lastFrame = -1;
    onScroll();
  });

  /* Paint right away if images are cached */
  setTimeout(() => {
    if (isReady) { sizeCanvas(); lastFrame = -1; onScroll(); }
  }, 100);

  /* ─── CONTACT FORM HANDLER ────────────────────────────── */
  window.handleFormSubmit = function(e) {
    e.preventDefault();
    const btn    = document.getElementById('cf-submit-btn');
    const success = document.getElementById('cf-success');
    const form    = document.getElementById('contact-form');
    
    // Get all values
    const payload = {
      name:    document.getElementById('cf-name').value,
      email:   document.getElementById('cf-email').value,
      subject: document.getElementById('cf-subject').value,
      message: document.getElementById('cf-msg').value
    };

    btn.disabled = true;
    btn.innerHTML = 'Sending...';
    
    // 🚀 NEW RE-DEPLOYED URL
    const scriptURL = 'https://script.google.com/macros/s/AKfycbylyoFv_SDa0CjOyCQAUxk5fWbWquOMW0DtfdcxkAEZseRdmWOTds5fsr6mS9eqcWPDNg/exec';

    fetch(scriptURL, {
      method: 'POST',
      mode: 'no-cors', // Essential for Google Apps Script Web Apps
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(() => {
      // In 'no-cors' mode, we won't get a true JSON result object back,
      // but if the promise resolves, the message reached the script.
      btn.innerHTML = 'Message Sent!';
      success.classList.add('visible');
      form.reset();
    })
    .catch((err) => {
      console.error('Submission failed:', err);
      btn.innerHTML = 'Error Sending';
      btn.disabled = false;
    });
  };

})();
