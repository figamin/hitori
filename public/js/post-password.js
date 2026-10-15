(function () {
  const KEY = 'postPassword';
  const IDS = ['post-password', 'post-password-qr'];

  const read = () => {
    try {
      return localStorage.getItem(KEY) || '';
    } catch (e) {
      return '';
    }
  };

  const write = (value) => {
    try {
      if (value) localStorage.setItem(KEY, value);
    } catch (e) {
    }
  };

  const boxes = () =>
    IDS.map((id) => document.getElementById(id)).filter(Boolean);

  const apply = (value) => {
    boxes().forEach((el) => {
      if (el.value !== value) el.value = value;
    });
  };

  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const generate = () => {
    let out = '';
    while (out.length < 8) {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      for (const byte of bytes) {
        if (byte < 252 && out.length < 8) out += ALPHABET[byte % ALPHABET.length];
      }
    }
    return out;
  };

  const ensure = () => {
    const box = boxes()[0];
    const current = box ? String(box.value || '').trim() : '';
    if (current) return current;
    const fresh = generate();
    apply(fresh);
    write(fresh);
    return fresh;
  };

  window.postPassword = { ensure, generate };

  const saved = read();
  const present = boxes();
  if (!present.length) return;

  if (saved) {
    apply(saved);
  } else {
    write(present[0].value);
  }

  boxes().forEach((el) => {
    el.addEventListener('input', () => {
      if (el.value) write(el.value);
    });
  });

  document.addEventListener(
    'reset',
    () => {
      const value = read();
      if (value) setTimeout(() => apply(value), 0);
    },
    true
  );
})();
