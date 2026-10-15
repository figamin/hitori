(function () {
  const PREVIEW_DELAY = 250;

  const state = {
    popup: null,
    textarea: null,
    modeButton: null,
    status: null,
    saveButton: null,
    previewLabel: null,
    link: null,
    container: null,
    previewWrapper: null,
    previewBody: null,
    mode: 'markup',
    values: { markup: '', raw: '' },
    timer: null,
    seq: 0
  };

  function postParams(editLink) {
    return {
      boardUri: editLink.dataset.board,
      threadId: Number(editLink.dataset.thread),
      postId: Number(editLink.dataset.post),
      isThread: editLink.dataset.threadPost === '1'
    };
  }

  async function api(url, { method = 'GET', body } = {}) {
    const res = await fetch(url, {
      method,
      headers: csrfHeaders(body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }


  function buildPopup() {
    const popup = document.createElement('div');
    popup.id = 'editPost';
    popup.innerHTML =
      '<div id="editPostHeader"><p>Edit post <span id="editPostNumber"></span><button id="editPostClose" type="button">×</button></p></div>' +
      '<div id="editPostBody">' +
      '<textarea id="editPostMessage" rows="7" spellcheck="false"></textarea>' +
      '<div id="editPostTools"><button id="editPostMode" type="button">Edit raw HTML</button></div>' +
      '<p class="file-info" id="editPostHint"></p>' +
      '<div id="editPostActions"><button id="editPostSave" type="button">Save</button><button id="editPostCancel" type="button">Cancel</button></div>' +
      '<p class="file-info" id="editPostStatus"></p>' +
      '</div>';

    state.popup = popup;
    state.textarea = popup.querySelector('#editPostMessage');
    state.modeButton = popup.querySelector('#editPostMode');
    state.status = popup.querySelector('#editPostStatus');
    state.saveButton = popup.querySelector('#editPostSave');
    state.hint = popup.querySelector('#editPostHint');

    popup.querySelector('#editPostClose').addEventListener('click', close);
    popup.querySelector('#editPostCancel').addEventListener('click', close);
    state.saveButton.addEventListener('click', save);
    state.modeButton.addEventListener('click', () => switchMode(state.mode === 'markup' ? 'raw' : 'markup'));
    state.textarea.addEventListener('input', schedulePreview);

    initDragging(popup, popup.querySelector('#editPostHeader'));
    document.body.appendChild(popup);
    return popup;
  }

  function initDragging(element, handle) {
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const startDrag = (e) => {
      e.preventDefault();
      const rect = element.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      const move = (moveEvent) => {
        element.style.left = `${startLeft + (moveEvent.clientX - startX)}px`;
        element.style.top = `${startTop + (moveEvent.clientY - startY)}px`;
        element.style.right = 'auto';
      };
      const stop = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', stop);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', stop);
    };

    handle.addEventListener('mousedown', startDrag);
  }


  function buildPreview() {
    removePreview();

    const wrapper = document.createElement('div');
    wrapper.className = 'edit-preview';
    wrapper.innerHTML = '<p class="edit-preview-label">Preview</p>';

    const clone = state.container.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    clone.querySelectorAll('[data-post-id]').forEach((node) => node.removeAttribute('data-post-id'));
    clone.querySelectorAll('input[type="checkbox"]').forEach((node) => node.remove());
    wrapper.appendChild(clone);

    state.previewLabel = wrapper.querySelector('.edit-preview-label');
    state.previewBody = clone.querySelector('.reply-content, .thread-content') || clone;
    state.previewWrapper = wrapper;
    state.container.parentNode.insertBefore(wrapper, state.container.nextSibling);
  }

  function removePreview() {
    if (state.previewWrapper) state.previewWrapper.remove();
    state.previewWrapper = null;
    state.previewBody = null;
    state.previewLabel = null;
  }

  function schedulePreview() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(renderPreview, PREVIEW_DELAY);
  }

  async function renderPreview() {
    if (!state.link || !state.previewBody) return;
    const seq = ++state.seq;
    const params = postParams(state.link);
    try {
      const { html } = await api('/mod/api/edit/preview', {
        method: 'POST',
        body: { ...params, message: state.textarea.value, mode: state.mode }
      });
      if (seq !== state.seq || !state.previewBody) return;
      state.previewBody.innerHTML = html;
      if (state.previewLabel) state.previewLabel.textContent = state.mode === 'raw' ? 'Preview (raw HTML)' : 'Preview';
    } catch (err) {
      if (seq === state.seq) state.status.textContent = `Preview failed: ${err.message}`;
    }
  }


  function applyMode() {
    if (state.mode === 'raw') {
      state.modeButton.textContent = 'Edit raw markup';
      state.hint.textContent = 'Raw HTML is stored exactly as written.';
    } else {
      state.modeButton.textContent = 'Edit raw HTML';
      state.hint.textContent = 'Markup is rendered like a new post (styling, quotes, links).';
    }
  }

  function switchMode(next) {
    state.values[state.mode] = state.textarea.value;
    state.mode = next;
    state.textarea.value = state.values[next] ?? '';
    applyMode();
    schedulePreview();
  }

  async function open(editLink) {
    const reopen = state.link !== editLink;
    state.link = editLink;
    if (!state.popup) buildPopup();
    state.popup.style.display = 'block';

    if (reopen) {
      state.container = editLink.closest('.post-container') || editLink.closest('.reply, .op') || editLink.closest('.post');
      state.status.textContent = 'Loading…';
      state.textarea.value = '';
      state.values = { markup: '', raw: '' };
      state.mode = 'markup';
      applyMode();
      state.hint.textContent = '';
      state.textarea.disabled = true;
      state.saveButton.disabled = true;

      state.popup.querySelector('#editPostNumber').textContent = `No.${editLink.dataset.post}`;
      buildPreview();

      const params = postParams(editLink);
      try {
        const data = await api(
          `/mod/api/edit/source?boardUri=${encodeURIComponent(params.boardUri)}&threadId=${params.threadId}&postId=${params.postId}&isThread=${params.isThread ? '1' : '0'}`
        );
        if (state.link !== editLink) return;
        state.values.markup = data.source ?? '';
        state.values.raw = data.raw ?? '';
        state.mode = state.values.markup ? 'markup' : 'raw';
        state.textarea.value = state.values[state.mode];
        applyMode();
        state.status.textContent = '';
        renderPreview();
      } catch (err) {
        if (state.link !== editLink) return;
        state.status.textContent = `Could not load the post: ${err.message}`;
      } finally {
        state.textarea.disabled = false;
        state.saveButton.disabled = false;
      }
    }

    state.container.scrollIntoView({ block: 'center' });
    state.textarea.focus();
  }

  function close() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.seq += 1;
    removePreview();
    if (state.popup) state.popup.style.display = 'none';
    state.link = null;
  }

  async function save() {
    if (!state.link) return;
    const params = postParams(state.link);
    state.saveButton.disabled = true;
    state.status.textContent = 'Saving…';
    try {
      await api('/mod/api/edit', {
        method: 'POST',
        body: { ...params, message: state.textarea.value, mode: state.mode }
      });
      location.reload();
    } catch (err) {
      state.status.textContent = err.message;
      state.saveButton.disabled = false;
    }
  }

  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : e.target.parentElement;
    const editLink = target?.closest?.('.mod-edit-post');
    if (!editLink) return;
    e.preventDefault();
    open(editLink);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.popup && state.popup.style.display === 'block') close();
  });
})();
