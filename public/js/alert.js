(function () {
  const queue = [];
  let handler = null;

  function build() {
    handler = document.createElement('div');
    handler.id = 'alert_handler';
    handler.innerHTML =
      '<div id="alert_background"></div>' +
      '<div id="alert_div" role="alertdialog" aria-modal="true" aria-labelledby="alert_message">' +
      '<button type="button" id="alert_close" aria-label="Close">&times;</button>' +
      '<div id="alert_message"></div>' +
      '<button type="button" class="alert_button">OK</button>' +
      '</div>';
    handler.querySelector('#alert_background').addEventListener('click', close);
    handler.querySelector('#alert_close').addEventListener('click', close);
    handler.querySelector('.alert_button').addEventListener('click', close);
    handler.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
    document.body.appendChild(handler);
  }

  function show() {
    if (!handler) {
      build();
      void handler.offsetWidth;
    }
    setText(handler.querySelector('#alert_message'), queue[0].message);
    handler.classList.add('open');
    handler.querySelector('.alert_button').focus();
  }

  function close() {
    const done = queue.shift();
    if (queue.length) show();
    else handler.classList.remove('open');
    if (done) done.resolve();
  }

  window.alert = function alert(message) {
    return new Promise((resolve) => {
      queue.push({ message: message == null ? '' : String(message), resolve });
      if (queue.length > 1) return;
      if (document.body) show();
      else document.addEventListener('DOMContentLoaded', show, { once: true });
    });
  };
})();
