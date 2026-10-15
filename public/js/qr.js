const QUICK_REPLY_HIDDEN = '(max-width: 768px), (hover: none) and (pointer: coarse)';

function quickReplyHidden() {
  return window.matchMedia(QUICK_REPLY_HIDDEN).matches;
}

function insertQuote(id) {
  const hidden = quickReplyHidden();
  const quickreplydiv = document.getElementById('quickReply');
  const msg = document.getElementById(hidden ? 'message' : 'message-qr');
  if (!msg) return;
  if (!hidden) quickreplydiv.classList.add('show-quickreply');

  const quote = `>>${id}\n`;
  const value = msg.value;
  const start = msg.selectionStart ?? value.length;
  const end = msg.selectionEnd ?? value.length;
  const before = value.slice(0, start);
  const prefix = before && !before.endsWith('\n') ? '\n' : '';
  msg.value = before + prefix + quote + value.slice(end);
  const caret = start + prefix.length + quote.length;
  msg.focus();
  msg.setSelectionRange(caret, caret);
  msg.dispatchEvent(new Event('input', { bubbles: true }));
}

function quickReply() {
  const quickreplydiv = document.getElementById('quickReply');
  const hash = window.location.hash;
  if (hash && hash.startsWith('#q')) {
    insertQuote(hash.substring(2));
  } else {
    quickreplydiv.classList.remove('show-quickreply');
  }
}

document.addEventListener('click', (e) => {
  const link = e.target instanceof Element && e.target.closest('a.linkQuote[href*="#q"]');
  if (!link || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const url = new URL(link.href, window.location.href);
  if (url.pathname !== window.location.pathname || !url.hash.startsWith('#q')) return;
  e.preventDefault();
  insertQuote(url.hash.substring(2));
});

function initDragging(element, handle) {
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0;
  let startLeft, startTop;

  const rightPos = parseInt(getComputedStyle(element).right);
  const leftPos = window.innerWidth - (element.offsetWidth + rightPos);
  element.style.left = leftPos + 'px';
  element.style.right = 'auto';

  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;

    startLeft = parseInt(getComputedStyle(element).left);
    startTop = parseInt(getComputedStyle(element).top);

    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();

    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    const newLeft = startLeft - pos1;
    const newTop = startTop - pos2;

    element.style.left = newLeft + 'px';
    element.style.top = newTop + 'px';

    startLeft = newLeft;
    startTop = newTop;
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

initDragging(document.getElementById('quickReply'), document.getElementById('quickReplyHeader'));
window.onhashchange = quickReply;

document.getElementById('message-qr').addEventListener('input', function () {
  document.getElementById('qr-charCount').textContent = this.value.length;
});

function syncText(a, b) {
  if (!a || !b) return;
  a.oninput = function () {
    b.value = this.value;
  };
  b.oninput = function () {
    a.value = this.value;
  };
}

function syncClick(a, b) {
  if (!a || !b) return;
  a.onchange = function () {
    b.checked = this.checked;
  };
  b.onchange = function () {
    a.checked = this.checked;
  };
}

let qr_ta = document.getElementById('message-qr');
let st_ta = document.getElementById('message');
syncText(qr_ta, st_ta);

let qr_nm = document.getElementById('name-qr');
let st_nm = document.getElementById('name');
syncText(qr_nm, st_nm);

syncText(document.getElementById('post-password-qr'), document.getElementById('post-password'));

for (const name of ['fortune', 'sage', 'nonoko']) {
  syncClick(document.getElementById(`${name}-qr`), document.getElementById(name));
}

document.addEventListener('DOMContentLoaded', () => {
  const mainPreviewContainer = document.getElementById('preview-container');
  const qrFileSection = document.getElementById('qr-file-section');
  const mainForm = document.querySelector('.reply-form:not(#quick-reply-form)');
  const qrForm = document.getElementById('quick-reply-form');

  function syncSpoilerRadios() {
    const qrSpoilerRadios = qrFileSection.querySelectorAll('input[type="radio"][name^="spoiler_"]');
    const mainSpoilerRadios = mainForm.querySelectorAll('input[type="radio"][name^="spoiler_"]');

    mainSpoilerRadios.forEach((radio, index) => {
      if (qrSpoilerRadios[index]) {
        qrSpoilerRadios[index].checked = radio.checked;
      }
    });
  }

  const quickReplyEl = document.getElementById('quickReply');
  const mainFileInput = mainForm && mainForm.querySelector('#image');
  const qrDropZone = document.getElementById('qr-dropzone');

  if (!mainFileInput || !mainPreviewContainer) {
    if (qrDropZone) qrDropZone.hidden = true;
  } else {
    qrDropZone.addEventListener('click', () => {
      if (!mainFileInput.disabled) mainFileInput.click();
    });

    let dragDepth = 0;
    quickReplyEl.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer?.types?.includes('Files') || mainFileInput.disabled) return;
      dragDepth++;
      quickReplyEl.classList.add('qr-dragover');
    });
    quickReplyEl.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    });
    quickReplyEl.addEventListener('dragleave', () => {
      if (--dragDepth <= 0) {
        dragDepth = 0;
        quickReplyEl.classList.remove('qr-dragover');
      }
    });
    quickReplyEl.addEventListener('drop', (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragDepth = 0;
      quickReplyEl.classList.remove('qr-dragover');
      if (mainFileInput.disabled) return;
      if (typeof window.handleFilesUpload === 'function') window.handleFilesUpload(Array.from(e.dataTransfer.files));
    });
  }

  function mirrorFields(source, slot) {
    if (!source || !slot) return null;
    const fields = (root) => root.querySelectorAll('input, select, textarea');
    let copy;

    function refresh() {
      const from = fields(source);
      fields(copy).forEach((field, i) => {
        if (from[i]) field.value = from[i].value;
      });
    }

    function build() {
      copy = source.cloneNode(true);
      copy.removeAttribute('style');
      [copy, ...copy.querySelectorAll('[id]')].forEach((el) => {
        el.id += '-qr';
      });
      slot.replaceChildren(copy);
      refresh();
    }

    function copyValue(e, from, to) {
      const index = Array.from(fields(from)).indexOf(e.target);
      const target = fields(to)[index];
      if (index !== -1 && target) target.value = e.target.value;
    }

    slot.addEventListener('input', (e) => copyValue(e, copy, source));
    slot.addEventListener('change', (e) => copyValue(e, copy, source));
    source.addEventListener('input', (e) => copyValue(e, source, copy));
    source.addEventListener('change', (e) => copyValue(e, source, copy));
    slot.addEventListener('click', (e) => {
      const button = e.target instanceof Element && e.target.closest('button[id$="-qr"]');
      if (!button) return;
      e.preventDefault();
      document.getElementById(button.id.slice(0, -3))?.click();
    });
    new MutationObserver(build).observe(source, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    build();
    return { slot, refresh };
  }

  const qrEmbed = mirrorFields(document.getElementById('embed-mode-content'), document.getElementById('qr-embed-slot'));
  const qrPoll = mirrorFields(document.getElementById('poll-details'), document.getElementById('qr-poll-slot'));

  function refreshMirrors() {
    qrEmbed?.refresh();
    qrPoll?.refresh();
  }
  mainForm?.addEventListener('reset', () => setTimeout(refreshMirrors));

  const mainModeButtons = mainForm ? Array.from(mainForm.querySelectorAll('.mode-select-btn')) : [];
  const qrModes = document.getElementById('qr-modes');
  const qrModeLinks = [];

  function activeMode() {
    const active = mainModeButtons.find((btn) => btn.classList.contains('active'));
    return active ? active.dataset.mode : 'file';
  }

  function updateMode() {
    const mode = activeMode();
    qrModeLinks.forEach((link) => link.classList.toggle('active', link.dataset.mode === mode));
    if (qrDropZone && mainFileInput) qrDropZone.hidden = mode === 'youtube';
    qrFileSection.hidden = mode === 'youtube';
    if (qrEmbed) qrEmbed.slot.hidden = mode !== 'youtube';
    if (qrPoll) qrPoll.slot.hidden = mode !== 'poll';
    refreshMirrors();
  }

  if (qrModes && mainModeButtons.length > 1) {
    mainModeButtons.forEach((btn, index) => {
      if (index > 0) qrModes.append(' / ');
      const link = document.createElement('span');
      link.className = 'qr-mode';
      link.dataset.mode = btn.dataset.mode;
      link.textContent = btn.textContent.trim();
      link.addEventListener('click', () => {
        btn.click();
        updateMode();
      });
      qrModeLinks.push(link);
      qrModes.appendChild(link);
    });
    qrModes.hidden = false;
    mainModeButtons.forEach((btn) => btn.addEventListener('click', () => setTimeout(updateMode)));
  }
  updateMode();

  function reattachEventListeners() {
    const qrRemoveButtons = qrFileSection.querySelectorAll('.remove-file');
    const mainRemoveButtons = mainForm.querySelectorAll('.remove-file');

    qrRemoveButtons.forEach((button, index) => {
      button.onclick = () => {
        if (mainRemoveButtons[index]) {
          mainRemoveButtons[index].click();
        }
      };
    });

    const qrSpoilerRadios = qrFileSection.querySelectorAll('input[type="radio"][name^="spoiler_"]');
    const mainSpoilerRadios = mainForm.querySelectorAll('input[type="radio"][name^="spoiler_"]');

    qrSpoilerRadios.forEach((radio, index) => {
      radio.onchange = () => {
        const mainRadio = mainSpoilerRadios[index];
        if (mainRadio) {
          mainRadio.checked = true;
          mainRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
    });

    mainSpoilerRadios.forEach((radio, index) => {
      radio.addEventListener('change', () => {
        const qrRadios = qrFileSection.querySelectorAll('input[type="radio"][name^="spoiler_"]');
        if (qrRadios[index]) {
          qrRadios[index].checked = true;
        }
      });
    });
  }

  let qrInFlight = false;
  qrForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (qrInFlight) return;
    qrInFlight = true;
    const qrSubmitButtons = [...qrForm.querySelectorAll('button[type="submit"], input[type="submit"]')];
    qrSubmitButtons.forEach((button) => {
      button.disabled = true;
    });

    const formData = new FormData();

    const formFields = new FormData(qrForm);
    for (let [key, value] of formFields.entries()) {
      if (key !== 'image') {
        formData.append(key, value);
      }
    }

    if (window.postPassword && typeof window.postPassword.ensure === 'function') {
      formData.set('post-password', window.postPassword.ensure());
    }

    if (mainFileInput && !mainFileInput.disabled && mainFileInput.files.length > 0) {
      for (let i = 0; i < mainFileInput.files.length; i++) {
        formData.append('image', mainFileInput.files[i]);
      }
    }

    if (window.getSpoilerFields) {
      window.getSpoilerFields(mainForm).forEach(({ name, value }) => formData.append(name, value));
    }

    try {
      const response = await fetch(qrForm.action, {
        method: 'POST',
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const result = await response.json();

        if (result.success) {
          qrForm.reset();
          mainForm.reset();

          const qrPreviewContainer = qrFileSection.querySelector('#qr-preview-container');
          if (qrPreviewContainer) qrPreviewContainer.innerHTML = '';
          if (mainPreviewContainer) mainPreviewContainer.innerHTML = '';

          if (typeof globalFormState !== 'undefined') {
            globalFormState = {
              name: '',
              sage: false,
              message: '',
              files: []
            };
          }

          if (result.postPassword && result.postKey) {
            savePostPassword(result.postKey, result.postPassword);
          } else if (result.post) {
            const boardUri = result.post.boardUri;
            const threadId = result.post.threadId;
            const postId = result.post.postId;
            const postKey = `${boardUri}/${threadId}/${postId}`;
            savePostPassword(postKey, formData.get('post-password') || '');
          }

          if (result.post.nonoko) {
            window.location.href = `/${result.post.boardUri}/`;
            return;
          }

          if (typeof lastPostedId !== 'undefined') {
            lastPostedId = result.post.postId;
          }

          if (window.threadAutoRefresh) {
            window.threadAutoRefresh.refreshPosts(true);
          }

          if (typeof watchedThreads !== 'undefined') {
            watchedThreads.autoWatchThread(result.post.threadId, result.post.boardUri, result.post.subject, result.post.message);
          }

          document.getElementById('quickReply').classList.remove('show-quickreply');
        } else if (result.error) {
          if (result.error === 'flood') {
            alert(result.message || 'Posting too quickly. Please wait a moment.');
          } else if (result.error === 'banned') {
            if (result.redirectUrl) {
              window.location.href = result.redirectUrl;
            } else {
              alert('You are banned from posting.');
            }
          } else {
            alert(result.error.message || result.message || result.error || 'Error posting reply');
          }
        }
      } else if (!response.ok) {
        const errorText = await response.text();

        let errorMessage = 'Error posting reply';

        if (response.status === 429) {
          errorMessage = 'Posting too quickly. Please wait a moment.';
        } else if (response.status === 403) {
          errorMessage = 'Your post was blocked. This may be due to spam prevention measures.';
        } else if (errorText.includes('Posting Restricted') || errorText.includes('Posting not allowed')) {
          const errorMatch = errorText.match(/<p[^>]*>(.*?)<\/p>/i);
          if (errorMatch && errorMatch[1]) {
            errorMessage = errorMatch[1].replace(/<[^>]*>/g, '');
          } else {
            errorMessage = 'Posting is restricted from your IP address due to spam prevention measures.';
          }
        }

        alert(errorMessage);
      }
    } catch (error) {
      console.error('Error posting reply:', error);
      alert('Error posting reply');
    } finally {
      qrInFlight = false;
      qrSubmitButtons.forEach((button) => {
        button.disabled = false;
      });
    }
  });

  function syncContent() {
    if (mainPreviewContainer) {
      const copy = mainPreviewContainer.cloneNode(true);
      copy.id = 'qr-preview-container';
      copy.removeAttribute('style');
      qrFileSection.replaceChildren(copy);
      reattachEventListeners();
      syncSpoilerRadios(); 
    }
  }

  syncContent();

  const observer = new MutationObserver(syncContent);

  if (mainPreviewContainer) {
    observer.observe(mainPreviewContainer, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });
  }
});

document.getElementById('qr-close').addEventListener('click', function () {
  document.getElementById('quickReply').classList.remove('show-quickreply');
  if (window.location.hash.startsWith('#q')) {
    history.pushState('', document.title, window.location.pathname + window.location.search);
  }
});

function savePostPassword(postKey, password) {
  try {
    const postPasswords = JSON.parse(localStorage.getItem('postingPasswords') || '{}');
    postPasswords[postKey] = password;
    localStorage.setItem('postingPasswords', JSON.stringify(postPasswords));
    console.log('QR: Saved password to localStorage:', {
      key: postKey,
      password: password
    });
  } catch (e) {
    console.error('QR: Error saving password to localStorage:', e);
  }
}

quickReply();
