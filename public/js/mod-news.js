(() => {
  const form = document.getElementById('news-editor-form');
  if (!form) return;

  const textarea = document.getElementById('news-contents');
  const preview = document.getElementById('news-preview-content');
  const previewMode = document.getElementById('news-preview-mode');
  const heading = document.getElementById('news-editor-heading');
  const toggle = document.getElementById('news-mode-toggle');
  const hint = document.getElementById('news-mode-hint');
  const status = document.getElementById('news-status');
  const submitButton = form.querySelector('button[type="submit"]');

  const HINTS = {
    markup: 'Markup is rendered the way a post is — the same rules (**bold**, [spoiler], >>123, links). Switch to raw HTML to see and edit what actually gets stored.',
    raw: 'This is the HTML that is stored and printed on /news, exactly as typed. Switch to markup to write it as a post instead — saving re-renders whatever is in the box.'
  };

  let mode = form.dataset.mode === 'raw' ? 'raw' : 'markup';
  const values = { markup: mode === 'markup' ? textarea.value : '', raw: mode === 'raw' ? textarea.value : '' };
  let seq = 0;
  let previewTimer = null;
  let savedRaw = values.raw;

  const setStatus = (text, bad = false) => {
    status.textContent = text || '';
    status.classList.toggle('news-bad', bad);
  };

  const api = async (url, body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: csrfHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
    return data;
  };


  const renderChrome = (bodyHtml) => {
    const title = form.querySelector('[name=title]')?.value || '';
    const author = form.querySelector('[name=author]')?.value || '';
    const email = form.querySelector('[name=authorEmail]')?.value || '';
    const image = form.querySelector('[name=image]')?.value || '';
    const date = form.querySelector('[name=date]')?.value;

    preview.textContent = '';

    const heading = document.createElement('div');
    heading.className = 'news-title';
    const titleSpan = document.createElement('span');
    titleSpan.style.textTransform = 'uppercase';
    titleSpan.textContent = title || '(no title)';
    heading.append(titleSpan, ' by ');
    if (email) {
      const link = document.createElement('a');
      link.href = `mailto:${email}`;
      link.textContent = author || '(no author)';
      heading.append(link);
    } else {
      heading.append(author || '(no author)');
    }
    const when = date ? new Date(date) : null;
    if (when && !Number.isNaN(when.getTime())) heading.append(` - ${when.toLocaleString()}`);
    preview.append(heading);

    if (image) {
      const picture = document.createElement('img');
      picture.className = 'news-image';
      picture.src = image;
      picture.alt = '';
      preview.append(picture);
    }

    const body = document.createElement('div');
    body.className = 'news-content';
    body.innerHTML = bodyHtml || '';
    preview.append(body);
  };

  const refreshPreview = async () => {
    const mine = ++seq;
    previewMode.textContent = mode === 'raw' ? '(raw HTML)' : '';
    try {
      const { html } = await api('/mod/api/news/preview', { contents: textarea.value, mode });
      if (mine !== seq) return;
      renderChrome(html);
    } catch (err) {
      if (mine !== seq) return;
      setStatus(`Preview failed: ${err.message}`, true);
    }
  };

  const queuePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 250);
  };


  const applyMode = (next) => {
    values[mode] = textarea.value;
    mode = next;
    form.dataset.mode = mode;
    textarea.value = values[mode];
    toggle.textContent = mode === 'raw' ? 'Back to markup' : 'Edit raw HTML';
    hint.textContent = HINTS[mode];
    textarea.placeholder = mode === 'raw'
      ? 'The article HTML, exactly as it will be printed'
      : 'Write the article the way you would write a post';
    clearTimeout(previewTimer);
    refreshPreview();
  };


  for (const button of form.querySelectorAll('[data-insert]')) {
    button.addEventListener('click', () => {
      const tag = button.dataset.insert || '';
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = textarea.value.slice(start, end);
      const middle = tag.indexOf('][');
      let insert = tag;
      let caret = start + tag.length;
      if (middle !== -1 && selected) {
        insert = `${tag.slice(0, middle + 1)}${selected}${tag.slice(middle + 1)}`;
        caret = start + insert.length;
      } else if (middle !== -1) {
        caret = start + middle + 1;
      }
      textarea.value = textarea.value.slice(0, start) + insert + textarea.value.slice(end);
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
      queuePreview();
    });
  }


  const collect = () => {
    const value = (name) => form.querySelector(`[name=${name}]`)?.value.trim() || '';
    return {
      title: value('title'),
      author: value('author'),
      authorEmail: value('authorEmail'),
      image: value('image'),
      date: isoDate(value('date')),
      contents: textarea.value,
      mode
    };
  };

  function isoDate(local) {
    if (!local) return '';
    const when = new Date(local);
    return Number.isNaN(when.getTime()) ? '' : when.toISOString();
  }

  const adoptArticle = (newsPost) => {
    form.dataset.newsId = String(newsPost.newsId);
    savedRaw = newsPost.contents || '';
    values.raw = savedRaw;
    heading.textContent = `Editing #${newsPost.newsId}`;
    history.replaceState(null, '', `/mod/news?edit=${newsPost.newsId}`);
    if (!document.getElementById('news-delete-btn')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'news-delete-btn';
      button.className = 'news-button news-danger';
      button.dataset.id = String(newsPost.newsId);
      button.textContent = 'Delete';
      form.querySelector('.news-actions').insertBefore(button, status);
      wireDelete();
    } else {
      document.getElementById('news-delete-btn').dataset.id = String(newsPost.newsId);
    }
  };

  const save = async () => {
    const newsId = form.dataset.newsId;
    const payload = collect();
    if (!payload.title || !payload.author) return setStatus('A title and an author are needed.', true);
    if (!payload.contents.trim()) return setStatus('The article is empty.', true);
    submitButton.disabled = true;
    setStatus('Saving…');
    try {
      if (newsId) {
        const { newsPost } = await api('/mod/api/news/update', { ...payload, newsId: Number(newsId) });
        savedRaw = newsPost.contents || savedRaw;
        values.raw = savedRaw;
        setStatus(`Saved #${newsPost.newsId}.`);
      } else {
        const { newsPost } = await api('/mod/api/news', payload);
        adoptArticle(newsPost);
        setStatus(`Published #${newsPost.newsId}.`);
      }
      refreshPreview();
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      submitButton.disabled = false;
    }
  };

  function wireDelete() {
    const button = document.getElementById('news-delete-btn');
    if (!button) return;
    button.addEventListener('click', async () => {
      if (!confirm('Delete this article?')) return;
      try {
        await api('/mod/api/news/delete', { newsId: Number(button.dataset.id) });
        location.href = '/mod/news';
      } catch (err) {
        setStatus(err.message, true);
      }
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });

  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    }
  });

  for (const field of form.querySelectorAll('.news-meta input')) field.addEventListener('input', queuePreview);

  toggle.addEventListener('click', () => applyMode(mode === 'raw' ? 'markup' : 'raw'));
  textarea.addEventListener('input', queuePreview);
  wireDelete();

  toggle.textContent = mode === 'raw' ? 'Back to markup' : 'Edit raw HTML';
  hint.textContent = HINTS[mode];
  refreshPreview();
  window.newsEditor = { get mode() { return mode; }, get savedRaw() { return savedRaw; } };
})();
