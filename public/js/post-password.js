// The post password ("for deletion") is remembered, the way a half-written post is.
//
// The server pre-fills each form with a fresh random password; the first one a
// reader sees is kept in localStorage and every later form shows *that* value
// instead of a new one, so a reader has a single password for all their posts and
// threads. Editing either box (the reply form's or the quick reply's - `qr.js` keeps
// the two in step) stores the new value. Nothing here is cleared after posting: the
// point is to reuse it.
//
// `postingPasswords` (per post, written by `board.js`/`thread.js`/`qr.js` on a
// successful post) is separate: it is what the delete menu and the delete form use
// to know which password belongs to which post.
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
      // Private mode or a full quota: the box still works for this page.
    }
  };

  const boxes = () =>
    IDS.map((id) => document.getElementById(id)).filter(Boolean);

  const apply = (value) => {
    boxes().forEach((el) => {
      if (el.value !== value) el.value = value;
    });
  };

  // A fresh password for a box the reader emptied, in the shape the server generates
  // (`be/lib/postPassword.js`): eight characters of `[a-z0-9]` from a CSPRNG. Bytes at or
  // above 252 are dropped instead of taken modulo 36, so no character is likelier than
  // another.
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

  // What a submit should post. Normally that is what the reader can see in the box; an
  // empty box means "give me a new one", and the new one is *left* in both boxes and
  // remembered, so the reader can read off the password their post was signed with and
  // their next post reuses it. (Posting the empty string is refused by the server, and
  // posting a password the reader never saw would leave them unable to delete the post
  // from this browser - it would live only in the delete menu's per-post map.)
  const ensure = () => {
    const box = boxes()[0];
    const current = box ? String(box.value || '').trim() : '';
    if (current) return current;
    const fresh = generate();
    apply(fresh);
    write(fresh);
    return fresh;
  };

  // For the submitters (`board.js`, `thread.js`, `qr.js`), which run after this script
  // and cannot tell an emptied box from a filled one on their own. Defined before the
  // early return below, because a page can have a form whose boxes this script did not
  // find (a stripped-down theme), and the callers still need the helper.
  window.postPassword = { ensure, generate };

  // Deferred load, so both forms are parsed by the time this runs.
  const saved = read();
  const present = boxes();
  if (!present.length) return;

  if (saved) {
    apply(saved);
  } else {
    // First sight of a generated password - keep it for every later post.
    write(present[0].value);
  }

  boxes().forEach((el) => {
    // `addEventListener`, not `oninput`: `qr.js` owns `oninput` on these two boxes
    // for its own mirroring and would be overwritten.
    el.addEventListener('input', () => {
      if (el.value) write(el.value);
    });
  });

  // A successful post resets its form, which puts the server's fresh value back in
  // the box. Restore the remembered one instead (the reset is applied after the
  // event, hence the deferral).
  document.addEventListener(
    'reset',
    () => {
      const value = read();
      if (value) setTimeout(() => apply(value), 0);
    },
    true
  );
})();
