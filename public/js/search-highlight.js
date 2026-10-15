(function () {
  'use strict';

  var STORAGE_KEY = 'koshi.searchHighlight';
  var HIT_CLASS = 'search-hit';
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1 };
  var WORD_CHAR = /[\p{L}\p{N}]/u;

  function readOptions() {
    var holder = document.getElementById('search-highlight-terms');
    if (!holder) return null;
    var parsed;
    try {
      parsed = JSON.parse(holder.textContent);
    } catch (e) {
      return null;
    }
    var terms = parsed && Array.isArray(parsed.terms) ? parsed.terms : [];
    terms = terms.filter(function (term) {
      return typeof term === 'string' && term.length > 0;
    });
    if (!terms.length) return null;
    terms.sort(function (a, b) {
      return b.length - a.length;
    });
    return { wholeWords: !!(parsed && parsed.wholeWords), pattern: new RegExp('(' + terms.map(escapeRegExp).join('|') + ')', 'giu') };
  }

  function escapeRegExp(value) {
    return String(value).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  function resultRoots() {
    return document.querySelectorAll('.search-page fieldset.search-board-group');
  }

  function textNodes(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentNode;
        if (!parent || SKIP_TAGS[parent.nodeName]) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (parent.classList.contains(HIT_CLASS)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('[data-no-highlight]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function isWordBoundary(text, start, end) {
    if (start > 0 && WORD_CHAR.test(text.charAt(start - 1))) return false;
    if (end < text.length && WORD_CHAR.test(text.charAt(end))) return false;
    return true;
  }

  function wrap(node, options) {
    var text = node.nodeValue;
    options.pattern.lastIndex = 0;
    if (!options.pattern.test(text)) return;
    options.pattern.lastIndex = 0;

    var fragment = document.createDocumentFragment();
    var last = 0;
    var match;
    while ((match = options.pattern.exec(text)) !== null) {
      var token = match[0];
      if (!token) {
        options.pattern.lastIndex++;
        continue;
      }
      var end = match.index + token.length;
      if (options.wholeWords && !isWordBoundary(text, match.index, end)) continue;
      if (match.index > last) fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
      var mark = document.createElement('mark');
      mark.className = HIT_CLASS;
      mark.textContent = token;
      fragment.appendChild(mark);
      last = end;
    }
    if (!last) return;
    if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(fragment, node);
  }

  function unwrap() {
    var marks = document.querySelectorAll('.search-page mark.' + HIT_CLASS);
    var parents = [];
    for (var i = 0; i < marks.length; i++) {
      var mark = marks[i];
      var parent = mark.parentNode;
      if (!parent) continue;
      if (parents.indexOf(parent) === -1) parents.push(parent);
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
    }
    parents.forEach(function (parent) {
      parent.normalize();
    });
  }

  function storedValue() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function init() {
    var box = document.getElementById('search-highlight');
    if (!box) return;

    box.checked = storedValue() === '1';

    var options = readOptions();

    function render() {
      unwrap();
      if (!options || !box.checked) return;
      resultRoots().forEach(function (root) {
        textNodes(root).forEach(function (node) {
          wrap(node, options);
        });
      });
    }

    box.addEventListener('change', function () {
      try {
        localStorage.setItem(STORAGE_KEY, box.checked ? '1' : '0');
      } catch (e) {
      }
      render();
    });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
