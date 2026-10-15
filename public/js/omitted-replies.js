// The newest-replies view of a thread. `be/routes/read.js` serves a thread opened with
// `?last=` trimmed to its newest replies, and `views/thread.ejs` prints a line above the
// first of them saying how many posts and image replies are missing. Clicking that line
// loads the missing replies in front of the ones on the page, without a navigation.
//
// The replies come from the thread's public JSON (the one the auto refresh reads) and are
// rendered one by one by the reply cell, exactly as `js/expansion.js` does for the five
// replies a board page previews - so what is loaded has the same markup, moderation block
// and behaviour as the replies the page came with.
(function () {
  const CHUNK_SIZE = 10;

  function announce(container) {
    if (window.initializePostMenus) window.initializePostMenus(container);
    if (window.initializeThumbnails) window.initializeThumbnails();
    if (window.initializePolls) window.initializePolls();
    if (window.backlinks?.init) window.backlinks.init();
    document.dispatchEvent(new CustomEvent('contentAdded'));
  }

  function initialize() {
    const notice = document.getElementById('omitted-notice');
    const replies = document.getElementById('replies');
    if (!notice || !replies) return;

    const expandLink = notice.querySelector('.expand-omitted');
    const collapseLink = notice.querySelector('.collapse-omitted');
    const omittedLine = notice.querySelector('.omitted-posts');
    const expandedLine = notice.querySelector('.expanded-posts');
    const sentence = expandLink.textContent;
    // `data-board` rather than the path: a moderator reads the same page under
    // `/mod/thread/...`, where the first path segment is not the board.
    const { board, threadId, before } = notice.dataset;

    let loading = false;
    let earlier = null;
    let container = null;

    // Everything older than the first reply the page came with, oldest first. The
    // thread's JSON is already in that order; the filter is what keeps the line correct
    // when it is clicked twice, or clicked after the thread has taken new replies.
    async function fetchEarlier() {
      const response = await fetch(`/${board}/thread/${threadId}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const posts = data.posts || [];
      const position = new Map(posts.map((post, index) => [String(post.postId), index]));
      return posts
        .filter((post) => Number(post.postId) < Number(before))
        .map((post) => ({ post, position: position.get(String(post.postId)) }));
    }

    async function expand() {
      if (loading) return;
      loading = true;
      expandLink.textContent = 'Loading the earlier replies…';

      container = document.createElement('div');
      container.className = 'earlier-replies';
      notice.parentNode.insertBefore(container, notice);

      try {
        if (!earlier) earlier = await fetchEarlier();

        // Every reply the page hid has been deleted since it was rendered: the line has
        // nothing left to offer, so it goes.
        if (!earlier.length) {
          container.remove();
          container = null;
          notice.remove();
          return;
        }

        for (let i = 0; i < earlier.length; i += CHUNK_SIZE) {
          const chunk = earlier.slice(i, i + CHUNK_SIZE);
          const cells = await Promise.all(
            chunk.map(({ post, position }) =>
              fetch(`/${board}/cells/reply`, {
                method: 'POST',
                headers: csrfHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                  reply: { ...post, sage: Boolean(post.sage) },
                  thread: { threadId, boardUri: board },
                  // The reply's real position in the thread, so whatever reads the number
                  // still counts from the OP.
                  replyNumber: position + 1
                })
              }).then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
              })
            )
          );

          const holder = document.createElement('div');
          holder.innerHTML = cells.join('');
          while (holder.firstElementChild) container.appendChild(holder.firstElementChild);

          // A little air between chunks, as `js/expansion.js` does, so a long thread does
          // not lock the tab up.
          if (i + CHUNK_SIZE < earlier.length) await new Promise((resolve) => setTimeout(resolve, 50));
        }

        announce(container);
        omittedLine.style.display = 'none';
        expandedLine.style.display = 'inline';
      } catch (error) {
        console.error('Error loading the earlier replies:', error);
        // Nothing was added, so the line goes back to offering them.
        if (container) container.remove();
        container = null;
        earlier = null;
        const message = document.createElement('div');
        message.className = 'error';
        message.textContent = 'Failed to load the earlier replies';
        notice.parentNode.insertBefore(message, notice);
        setTimeout(() => message.remove(), 5000);
      } finally {
        loading = false;
        expandLink.textContent = sentence;
      }
    }

    expandLink.addEventListener('click', (event) => {
      event.preventDefault();
      expand();
    });

    collapseLink.addEventListener('click', (event) => {
      event.preventDefault();
      // The container holds rendered posts, so it goes rather than hides: expanding again
      // rebuilds it from the thread's replies as they are then.
      if (container) container.remove();
      container = null;
      expandedLine.style.display = 'none';
      omittedLine.style.display = 'inline';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
