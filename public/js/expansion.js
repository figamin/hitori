window.initializeExpansion = function () {
  const threadFooters = document.querySelectorAll('.thread-footer');

  threadFooters.forEach((footer) => {
    const threadId = footer.dataset.threadId;
    const expandButton = footer.querySelector('.expand-thread');
    const collapseButton = footer.querySelector('.collapse-thread');
    const omittedPosts = footer.querySelector('.omitted-posts');
    const expandedPosts = footer.querySelector('.expanded-posts');
    const additionalReplies = footer.nextElementSibling;
    let isExpanding = false;

    if (expandButton) {
      expandButton.addEventListener('click', async function (e) {
        e.preventDefault();
        if (isExpanding) return;

        try {
          isExpanding = true;
          const currentPath = location.pathname.split('/').filter((p) => p)[0];
          const boardUri =
            currentPath === 'all'
              ? footer
                  .closest('.thread')
                  .querySelector('a[href^="/"]')
                  .textContent.match(/\/(\w+)\//)[1]
              : currentPath;

          const response = await fetch(`/${boardUri}/thread/${threadId}.json`);
          if (!response.ok) throw new Error('Network response was not ok');
          const data = await response.json();

          const existingReplies = new Set(Array.from(footer.parentNode.querySelectorAll('.reply')).map((r) => r.dataset.postId));

          const lastFivePostIds = new Set(data.posts.slice(-5).map((post) => post.postId.toString()));
          const newReplies = data.posts.filter(
            (reply) => !existingReplies.has(reply.postId.toString()) && !lastFivePostIds.has(reply.postId.toString())
          );

          const chunkSize = 10;
          for (let i = 0; i < newReplies.length; i += chunkSize) {
            const chunk = newReplies.slice(i, i + chunkSize);

            const replyPromises = chunk.map((reply, chunkIndex) => {
              const originalIndex = data.posts.findIndex((p) => p.postId === reply.postId);
              const replyNumber = originalIndex + 1; 

              return fetch(`/${boardUri}/cells/reply`, {
                method: 'POST',
                headers: csrfHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                  reply,
                  thread: { threadId, boardUri },
                  replyNumber: replyNumber
                })
              }).then((r) => r.text());
            });

            const renderedReplies = await Promise.all(replyPromises);

            const tempContainer = document.createElement('div');

            renderedReplies.forEach((replyHtml) => {
              tempContainer.innerHTML += replyHtml;
            });

            additionalReplies.appendChild(tempContainer);

            if (window.initializePostMenus) {
              window.initializePostMenus(tempContainer);
            }

            const newThumbnails = tempContainer.querySelectorAll('.media-toggle');
            if (newThumbnails.length && typeof initializeThumbnails === 'function') {
              initializeThumbnails();
            }

            if (i + chunkSize < newReplies.length) {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          }

          additionalReplies.style.display = 'block';
          omittedPosts.style.display = 'none';
          expandedPosts.style.display = 'inline';

          if (typeof backlinks?.init === 'function') {
            backlinks.init();
          }
        } catch (error) {
          console.error('Error fetching additional replies:', error);
          additionalReplies.textContent = '';
          const errEl = document.createElement('div');
          errEl.className = 'error';
          errEl.textContent = 'Failed to load replies';
          additionalReplies.appendChild(errEl);
        } finally {
          isExpanding = false;
        }
      });
    }

    if (collapseButton) {
      collapseButton.addEventListener('click', function (e) {
        e.preventDefault();
        additionalReplies.style.display = 'none';
        omittedPosts.style.display = 'inline';
        expandedPosts.style.display = 'none';
        additionalReplies.innerHTML = '';
      });
    }
  });
};

document.addEventListener('DOMContentLoaded', function () {
  window.initializeExpansion();
});
