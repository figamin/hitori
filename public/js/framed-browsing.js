(() => {
  'use strict';

  const KEY = 'framedBrowsing';
  const COLLAPSED_KEY = 'framedCollapsed';

  const BOARD_SECTIONS = [
    { key: 'vocal-synths', label: 'General Vocal-Synth Boards', boards: ['leek', 'mmd', 'live', 'negi'] },
    { key: 'artwork', label: 'Artwork Sharing Boards', boards: ['c', 'o', 'brs'] },
    { key: 'off-topic', label: 'Miscellaneous Boards', boards: ['g', 'j', 'meta'] }
  ];

  const RESERVED = new Set([
    'search', 'news', 'mod', 'login', 'logout', 'register', 'account', 'settings',
    'watcher', 'appeal', 'banned', 'warned', 'report', 'api', 'files', 'thumb', 'css',
    'js', 'img'
  ]);

  const BOARD_CONTENT = [
    '.reply-form-container', '.threads', '.catalog-threads', '.catalog-controls',
    '.page-nav', '.thread-refresh-controls', '.outerbox', '.board-top'
  ].join(', ');

  let moved = [];
  let enabled = false;

  const isBoardPage = () => {
    const path = window.location.pathname;
    const main = document.querySelector('main.content');
    if (path === '/' || !main || main.classList.contains('mod-page')) return false;
    if (document.querySelector('.search-page')) return false;
    const segment = path.split('/')[1] || '';
    if (!segment || segment.includes('.') || RESERVED.has(segment.toLowerCase())) return false;
    return !!document.querySelector(BOARD_CONTENT);
  };

  const boardRoot = () => {
    const segment = window.location.pathname.split('/')[1] || '';
    if (!segment || segment.toLowerCase() === 'all') return null;
    return `/${segment}/`;
  };

  const borrow = (target, selector, last = false) => {
    const nodes = document.querySelectorAll(selector);
    const node = last ? nodes[nodes.length - 1] : nodes[0];
    if (!node || target.contains(node)) return null;
    moved.push({ node, parent: node.parentNode, next: node.nextSibling });
    target.appendChild(node);
    return node;
  };

  const link = (href, text, title) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (title) a.title = title;
    return a;
  };

  const jump = (to) => (event) => {
    event.preventDefault();
    window.scrollTo({ top: to === 'top' ? 0 : document.documentElement.scrollHeight, behavior: 'smooth' });
  };

  const collapsedSections = () => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}') || {};
    } catch {
      return {};
    }
  };

  const section = (sidebar, key, label) => {
    const collapsed = collapsedSections()[key] === true;
    const header = document.createElement('div');
    header.className = 'section-header';
    const toggle = document.createElement('span');
    toggle.className = 'plus';
    toggle.textContent = collapsed ? '+' : '\u2212';
    header.append(toggle, document.createTextNode(` ${label}`));
    const body = document.createElement('div');
    body.className = collapsed ? 'submenu hidden' : 'submenu';
    toggle.addEventListener('click', () => {
      const hidden = body.classList.toggle('hidden');
      toggle.textContent = hidden ? '+' : '\u2212';
      const state = collapsedSections();
      state[key] = hidden;
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state));
    });
    sidebar.append(header, body);
    return body;
  };

  const boardList = (boards) => {
    const ul = document.createElement('ul');
    for (const board of boards) {
      const li = document.createElement('li');
      li.appendChild(link(`/${board.uri}/`, board.name));
      ul.appendChild(li);
    }
    return ul;
  };

  const build = () => {
    const container = document.querySelector('.container');
    const content = document.querySelector('main.content');
    if (!container || !content) return false;

    const sidebar = document.createElement('div');
    sidebar.className = 'frame-sidebar';
    sidebar.id = 'frameSidebar';

    const logo = document.createElement('img');
    logo.id = 'logo';
    logo.src = '/img/frames-logo.png';
    logo.alt = 'Front page';
    sidebar.appendChild(logo);

    const top = document.createElement('ul');
    const frontLi = document.createElement('li');
    frontLi.appendChild(link('/', 'Front Page', 'The front page'));
    const removeLi = document.createElement('li');
    const removeLink = link('#', '[Remove Frames]', 'Read the boards without the sidebar');
    removeLink.id = 'frame-remove';
    removeLink.addEventListener('click', (event) => {
      event.preventDefault();
      disable();
    });
    removeLi.appendChild(removeLink);
    top.append(frontLi, removeLi);
    sidebar.appendChild(top);

    const boards = (Array.isArray(window.frameBoards) ? window.frameBoards : []).filter((board) => board && board.uri);
    const listed = new Set();
    for (const group of BOARD_SECTIONS) {
      const members = group.boards.map((uri) => boards.find((board) => board.uri === uri)).filter(Boolean);
      members.forEach((board) => listed.add(board.uri));
      if (members.length) section(sidebar, group.key, group.label).appendChild(boardList(members));
    }
    const rest = boards.filter((board) => !listed.has(board.uri));
    if (rest.length) section(sidebar, 'other', 'Other Boards').appendChild(boardList(rest));
    if (!boards.length) borrow(section(sidebar, 'boards', 'Boards'), 'header .board-list');

    borrow(section(sidebar, 'search', 'Search'), '.navtopright .header-search-form');
    const site = section(sidebar, 'site', 'Site');
    const who = document.querySelector('header .navtopright')?.textContent.match(/\[\s*Logged in as[^\]]*\]/);
    if (who) {
      const note = document.createElement('div');
      note.className = 'frame-note';
      note.textContent = who[0].trim();
      site.appendChild(note);
    }
    borrow(site, 'header .navtopright');
    const pages = section(sidebar, 'pages', 'Pages');
    const pager = borrow(pages, '.pagination, .pagelist', true);
    borrow(pages, '.thread-refresh-controls');
    const root = boardRoot();
    const links = [
      link('#top', '[Top]', 'Back to the top of the page'),
      link('#bottom', '[Bottom]', 'Down to the bottom of the page')
    ];
    links[0].addEventListener('click', jump('top'));
    links[1].addEventListener('click', jump('bottom'));
    if (root && !pager) {
      links.push(link(root, '[Index]', 'The board index'));
      links.push(link(`${root}catalog`, '[Catalog]', 'The board catalog'));
    }
    pages.append(...links);
    borrow(section(sidebar, 'links', 'Links'), '#footer-links');

    container.insertBefore(sidebar, content);
    document.body.classList.add('framed-browsing');
    return true;
  };

  const destroy = () => {
    for (const { node, parent, next } of moved.reverse()) {
      if (next && next.parentNode === parent) parent.insertBefore(node, next);
      else parent.appendChild(node);
    }
    moved = [];
    document.getElementById('frameSidebar')?.remove();
    document.body.classList.remove('framed-browsing');
  };

  const apply = () => {
    if (enabled || !isBoardPage()) return false;
    enabled = build();
    return enabled;
  };

  const remove = () => {
    if (!enabled) return false;
    destroy();
    enabled = false;
    return true;
  };

  const disable = () => {
    localStorage.setItem(KEY, 'false');
    const box = document.getElementById('framed-browsing');
    if (box) box.checked = false;
    return remove();
  };

  window.framedBrowsing = {
    get enabled() {
      return enabled;
    },
    isBoardPage,
    setEnabled(value) {
      if (value) apply();
      else remove();
    },
    disable,
    toggle() {
      if (enabled) remove();
      else apply();
    }
  };

  const boot = () => {
    if (localStorage.getItem(KEY) === 'true') apply();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
