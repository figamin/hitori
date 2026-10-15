(() => {
  const SLIDE_MS = 5000;
  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 8;
  const WHEEL_STEP = 1.15;
  const BTN_STEP = 1.25;
  const DRAG_THRESH = 3;

  const state = {
    items: [],
    cursor: 0,
    active: false,
    playing: false,
    slideTimer: null,
    root: null,
    ui: null,
    preload: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    drag: null,
    skipClick: false
  };

  function wireTriggers() {
    document.querySelectorAll('#gallery-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggle();
      });
    });
    document.addEventListener('keydown', onKey);
  }

  function gatherItems() {
    const items = [];
    document.querySelectorAll('.media-toggle').forEach((link) => {
      const mime = link.getAttribute('data-mime') || '';
      // A browser that cannot decode JPEG XL gets no slide for one: the picture would
      // be blank there, and the plain link still offers the file (`thumb.js` holds the
      // test; a page without it treats the format as unshowable, which is the safe way
      // round).
      const isImage = mime.startsWith('image/') && (mime !== 'image/jxl' || (window.supportsJxl?.() ?? false));
      const isVideo = mime.startsWith('video/');
      if (!isImage && !isVideo) return;
      const img = link.querySelector('img');
      if (!img) return;
      const full = img.getAttribute('data-full') || link.getAttribute('href');
      if (!full) return;
      const post = link.closest('[data-post-id]');
      items.push({
        full,
        thumb: img.getAttribute('data-thumb') || img.src,
        thumbEl: img,
        name: img.getAttribute('alt') || post?.querySelector('.file-link')?.textContent?.trim() || '',
        postId: post?.dataset.postId || '',
        mime,
        isVideo,
        stripNode: null
      });
    });
    return items;
  }

  function firstVisibleIndex(items) {
    for (let i = 0; i < items.length; i++) {
      const el = items[i].thumbEl;
      if (!el) continue;
      if (el.getBoundingClientRect().bottom >= 0) return i;
    }
    return 0;
  }

  function toggle() {
    if (state.active) dismiss();
    else mount();
  }

  function canZoom() {
    return state.ui?.media?.nodeName === 'IMG';
  }

  function paintTransform() {
    const el = state.ui?.media;
    if (!el) return;
    el.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    if (state.ui.zoomPct) state.ui.zoomPct.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function clearZoom() {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    paintTransform();
  }

  function zoomToward(factor, cx, cy) {
    if (!canZoom()) return;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.zoom * factor));
    if (next === state.zoom) return;
    const box = state.ui.stage.getBoundingClientRect();
    const mx = cx - (box.left + box.width / 2);
    const my = cy - (box.top + box.height / 2);
    const k = next / state.zoom;
    state.panX = mx - (mx - state.panX) * k;
    state.panY = my - (my - state.panY) * k;
    state.zoom = next;
    paintTransform();
  }

  function zoomCenter(factor) {
    const r = state.ui.stage.getBoundingClientRect();
    zoomToward(factor, r.left + r.width / 2, r.top + r.height / 2);
  }

  function onWheel(e) {
    if (!canZoom()) return;
    e.preventDefault();
    zoomToward(e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, e.clientX, e.clientY);
  }

  function onPointerMove(e) {
    if (!state.drag) return;
    const dx = e.clientX - state.drag.ox;
    const dy = e.clientY - state.drag.oy;
    if (Math.abs(dx) > DRAG_THRESH || Math.abs(dy) > DRAG_THRESH) state.drag.moved = true;
    state.panX = state.drag.px + dx;
    state.panY = state.drag.py + dy;
    paintTransform();
  }

  function onPointerUp() {
    if (!state.drag) return;
    const { moved, fromImg } = state.drag;
    state.drag = null;
    state.ui.stage.classList.remove('mv-dragging');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    if (moved) state.skipClick = true;
    else if (state.zoom <= 1 && fromImg) stepForward();
  }

  function onPointerDown(e) {
    if (e.button !== 0 || !canZoom()) return;
    if (!e.target.closest('.mv-stage')) return;
    const fromImg = e.target.nodeName === 'IMG';
    e.preventDefault();
    state.drag = {
      ox: e.clientX,
      oy: e.clientY,
      px: state.panX,
      py: state.panY,
      moved: false,
      fromImg
    };
    state.skipClick = false;
    state.ui.stage.classList.add('mv-dragging');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function mount() {
    state.items = gatherItems();
    if (!state.items.length) return;

    const root = document.createElement('div');
    root.id = 'media-viewer';
    root.innerHTML =
      '<div class="mv-body">' +
      '<button type="button" class="mv-nav mv-nav-prev" aria-label="Previous">‹</button>' +
      '<div class="mv-stage"><div class="mv-frame"></div></div>' +
      '<button type="button" class="mv-nav mv-nav-next" aria-label="Next">›</button>' +
      '</div>' +
      '<div class="mv-toolbar">' +
      '<button type="button" class="mv-zoom-out" title="Zoom out">−</button>' +
      '<span class="mv-zoom-pct">100%</span>' +
      '<button type="button" class="mv-zoom-in" title="Zoom in">+</button>' +
      '<button type="button" class="mv-zoom-fit" title="Reset">Reset</button>' +
      '<a class="mv-filename" download></a>' +
      '<div class="mv-counter"><span data-mv="pos">0</span>/<span data-mv="len">0</span></div>' +
      '</div>' +
      '<div class="mv-strip"></div>' +
      '<div class="mv-chrome">' +
      '<button type="button" class="mv-dismiss" title="Close Gallery">×</button>' +
      '</div>';

    const ui = {
      root,
      stage: root.querySelector('.mv-stage'),
      frame: root.querySelector('.mv-frame'),
      strip: root.querySelector('.mv-strip'),
      chrome: root.querySelector('.mv-chrome'),
      filename: root.querySelector('.mv-filename'),
      pos: root.querySelector('[data-mv="pos"]'),
      len: root.querySelector('[data-mv="len"]'),
      zoomPct: root.querySelector('.mv-zoom-pct'),
      media: null
    };

    state.items.forEach((item, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'mv-chip';
      chip.dataset.index = String(i);
      const thumbImg = document.createElement('img');
      thumbImg.src = item.thumb;
      thumbImg.alt = '';
      chip.appendChild(thumbImg);
      chip.addEventListener('click', () => goTo(i));
      item.stripNode = chip;
      ui.strip.appendChild(chip);
    });

    ui.len.textContent = String(state.items.length);

    root.querySelector('.mv-nav-prev').addEventListener('click', () => goTo(state.cursor - 1));
    root.querySelector('.mv-nav-next').addEventListener('click', () => goTo(state.cursor + 1));
    root.querySelector('.mv-dismiss').addEventListener('click', dismiss);
    root.querySelector('.mv-zoom-in').addEventListener('click', () => zoomCenter(BTN_STEP));
    root.querySelector('.mv-zoom-out').addEventListener('click', () => zoomCenter(1 / BTN_STEP));
    root.querySelector('.mv-zoom-fit').addEventListener('click', clearZoom);
    ui.stage.addEventListener('click', (e) => {
      if (state.skipClick) {
        state.skipClick = false;
        return;
      }
      if (e.target === ui.stage || e.target === ui.frame) dismiss();
    });
    ui.stage.addEventListener('wheel', onWheel, { passive: false });
    ui.stage.addEventListener('pointerdown', onPointerDown);

    state.root = root;
    state.ui = ui;
    document.body.appendChild(root);
    document.documentElement.classList.add('media-viewer-open');
    document.body.style.overflow = 'hidden';
    state.active = true;
    goTo(firstVisibleIndex(state.items));
  }

  function makeMedia(item) {
    const el = document.createElement(item.isVideo ? 'video' : 'img');
    el.src = item.full;
    el.draggable = false;
    if (item.isVideo) {
      el.loop = true;
      el.controls = true;
      el.autoplay = true;
      el.addEventListener('click', (e) => e.stopPropagation());
    }
    return el;
  }

  function goTo(i, fromSlide) {
    if (!state.items.length) return;
    const len = state.items.length;
    i = ((i % len) + len) % len;
    const prev = state.cursor;
    const item = state.items[i];
    state.cursor = i;

    state.items[prev]?.stripNode?.classList.remove('mv-chip-active');
    item.stripNode.classList.add('mv-chip-active');
    const strip = state.ui.strip;
    strip.scrollLeft = item.stripNode.offsetLeft + item.stripNode.offsetWidth / 2 - strip.clientWidth / 2;

    if (state.ui.media?.pause) state.ui.media.pause();

    let media;
    if (state.preload && state.preload.dataset.index === String(i)) {
      media = state.preload;
      state.preload = null;
    } else {
      media = makeMedia(item);
    }
    media.dataset.index = String(i);

    state.ui.frame.replaceChildren(media);
    state.ui.media = media;
    state.ui.stage.scrollTop = 0;
    state.ui.pos.textContent = String(i + 1);
    state.ui.filename.textContent = item.name;
    state.ui.filename.href = item.full;
    state.ui.filename.download = item.name;
    clearZoom();

    if (item.isVideo) media.play().catch(() => {});

    const upcoming = state.items[(i + 1) % len];
    if (upcoming && !upcoming.isVideo) {
      const warm = new Image();
      warm.src = upcoming.full;
      warm.dataset.index = String((i + 1) % len);
      state.preload = warm;
    } else {
      state.preload = null;
    }

    if (state.playing && (fromSlide || i > prev || (prev === len - 1 && i === 0))) {
      armSlide();
    } else if (!fromSlide) {
      haltSlideshow();
    }
  }

  function stepForward() {
    const current = state.ui.media;
    if (current?.nodeName === 'VIDEO' && current.paused) {
      current.play().catch(() => {});
      return;
    }
    goTo(state.cursor + 1);
  }

  function clearSlideTimer() {
    clearTimeout(state.slideTimer);
    state.slideTimer = null;
  }

  function fireSlide() {
    const current = state.ui.media;
    if (current?.nodeName === 'VIDEO' && !current.paused) {
      current.loop = false;
      current.addEventListener('ended', () => goTo(state.cursor + 1, true), { once: true });
    } else {
      goTo(state.cursor + 1, true);
    }
  }

  function beginSlideCountdown() {
    clearSlideTimer();
    state.slideTimer = setTimeout(fireSlide, SLIDE_MS);
  }

  function armSlide() {
    clearSlideTimer();
    const current = state.ui.media;
    if (!current) return;
    const isVideo = current.nodeName === 'VIDEO';
    if (isVideo) current.play().catch(() => {});
    const ready = isVideo ? current.readyState >= 4 : current.complete;
    if (ready) beginSlideCountdown();
    else current.addEventListener(isVideo ? 'canplaythrough' : 'load', beginSlideCountdown, { once: true });
  }

  function beginSlideshow() {
    state.playing = true;
    state.ui.chrome.classList.add('mv-slideshow');
    armSlide();
  }

  function haltSlideshow() {
    if (!state.playing) return;
    clearSlideTimer();
    state.playing = false;
    state.ui.chrome.classList.remove('mv-slideshow');
    const current = state.ui.media;
    if (current?.nodeName === 'VIDEO') current.loop = true;
  }

  function dismiss() {
    if (!state.active) return;
    haltSlideshow();
    if (state.ui.media?.pause) state.ui.media.pause();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    state.root.remove();
    state.root = null;
    state.ui = null;
    state.preload = null;
    state.active = false;
    state.drag = null;
    state.skipClick = false;
    document.documentElement.classList.remove('media-viewer-open');
    document.body.style.overflow = '';
  }

  function onKey(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

    if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      toggle();
      return;
    }

    if (!state.active) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(state.cursor - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      goTo(state.cursor + 1);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomCenter(BTN_STEP);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomCenter(1 / BTN_STEP);
    } else if (e.key === '0') {
      e.preventDefault();
      clearZoom();
    } else if (e.key === ' ') {
      e.preventDefault();
      const current = state.ui.media;
      if (current?.nodeName === 'VIDEO') {
        haltSlideshow();
        if (current.paused) current.play().catch(() => {});
        else current.pause();
      } else {
        stepForward();
      }
    }
  }

  document.addEventListener('DOMContentLoaded', wireTriggers);
})();
