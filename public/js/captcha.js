(() => {
  const widgets = [...document.querySelectorAll('.captcha[data-captcha]')];
  const puzzles = widgets.filter((widget) => !widget.classList.contains('captcha-verified'));
  if (!puzzles.length) return;

  const CHALLENGE_MAX_AGE_MS = 15000; 

  let token = null;
  let loadedAt = 0;
  let loading = null;

  const message = (text, bad = false) => {
    for (const widget of puzzles) {
      const el = widget.querySelector('.captcha-message');
      if (!el) continue;
      el.textContent = text || '';
      el.classList.toggle('captcha-bad', bad);
    }
  };

  const markVerified = () => {
    token = null;
    for (const widget of widgets) {
      widget.classList.add('captcha-verified');
      widget.dataset.verified = '1';
      delete widget.dataset.token;
      widget.querySelectorAll('.captcha-puzzle, .captcha-actions').forEach((el) => el.remove());
    }
    window.captchaSolved = true;
  };

  const removePuzzles = () => {
    for (const widget of puzzles) widget.remove();
  };

  const load = async () => {
    message('Loading a picture…');
    for (const widget of puzzles) {
      widget.querySelector('.captcha-answer')?.setAttribute('disabled', 'disabled');
      const image = widget.querySelector('.captcha-image');
      if (image) image.removeAttribute('src');
    }
    try {
      const res = await fetch('/captcha/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) return message(data.error || `The captcha could not be loaded (HTTP ${res.status}).`, true);
      if (!data.enabled) return removePuzzles();
      if (data.solved) return markVerified();

      token = data.token;
      loadedAt = Date.now();
      for (const widget of puzzles) {
        widget.dataset.token = data.token;
        const image = widget.querySelector('.captcha-image');
        if (image) image.src = data.image;
        const answer = widget.querySelector('.captcha-answer');
        if (answer) {
          answer.value = '';
          answer.removeAttribute('disabled');
        }
      }
      message(data.instructions || 'Name the character in the picture.');
    } catch (err) {
      message(`The captcha could not be loaded: ${err.message}`, true);
    }
  };

  const ensurePuzzle = () => {
    if (loading) return loading;
    if (token && Date.now() - loadedAt < CHALLENGE_MAX_AGE_MS) return Promise.resolve();
    loading = load().finally(() => {
      loading = null;
    });
    return loading;
  };

  const setOpen = (open) => {
    for (const widget of widgets) widget.classList.toggle('captcha-collapsed', !open);
    if (open) ensurePuzzle();
  };

  const solve = async (answerBox) => {
    const text = String(answerBox?.value || '').trim();
    if (!text) return message('Type the character\'s name first.', true);

    message('Checking…');
    try {
      const res = await fetch('/captcha/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token, answer: text })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const error = data.error || 'That was not it.';
        await load();
        message(error, true);
        return;
      }
      markVerified();
    } catch (err) {
      message(`The answer could not be checked: ${err.message}`, true);
    }
  };

  for (const widget of widgets) widget.classList.add('captcha-scripted');
  setOpen(false);

  for (const widget of puzzles) {
    const answer = widget.querySelector('.captcha-answer');
    widget.querySelector('.captcha-open')?.addEventListener('click', () => setOpen(true));
    widget.querySelector('.captcha-hide')?.addEventListener('click', () => setOpen(false));
    widget.querySelector('.captcha-check')?.addEventListener('click', () => solve(answer));
    widget.querySelector('.captcha-refresh')?.addEventListener('click', () => load());
    answer?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      solve(answer);
    });
  }
})();
