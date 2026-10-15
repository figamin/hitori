document.addEventListener('DOMContentLoaded', function () {
  const addOptionBtn = document.getElementById('add-option');
  const pollOptions = document.getElementById('poll-options');
  const maxOptions = Number(pollOptions && pollOptions.dataset.maxOptions) || 10;
  let optionCount = pollOptions ? pollOptions.querySelectorAll('input[name="poll_options[]"]').length : 2;

  if (addOptionBtn && pollOptions) {
    if (optionCount >= maxOptions) {
      addOptionBtn.style.display = 'none';
    }

    addOptionBtn.addEventListener('click', function () {
      if (optionCount >= maxOptions) return;

      optionCount++;
      const input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.name = 'poll_options[]';
      input.placeholder = `Option ${optionCount}`;
      input.style.width = '90%';
      input.style.marginBottom = '5px';
      pollOptions.appendChild(input);

      if (optionCount >= maxOptions) {
        addOptionBtn.style.display = 'none';
      }
    });
  }
});

document.addEventListener('click', async function (event) {
  const voteButton = event.target?.closest ? event.target.closest('.vote-button') : null;
  if (!voteButton) return;

  const container = voteButton.closest('.poll-container');
  if (!container) return;
  event.preventDefault();

  const pollId = container.dataset.pollId;
  if (!pollId) {
    alert('This poll could not be identified. Please reload the page and try again.');
    return;
  }

  const options = container.querySelectorAll('input[type="radio"]');
  const selectedIndexes = [];
  options.forEach((opt, index) => {
    if (opt.checked) selectedIndexes.push(index);
  });

  if (selectedIndexes.length !== 1) {
    alert('Please select an option');
    return;
  }

  if (voteButton.disabled) return;
  voteButton.disabled = true;

  try {
    const response = await fetch('/api/poll/vote', {
      method: 'POST',
      headers: csrfHeaders({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        pollId,
        optionIndexes: selectedIndexes
      })
    });

    const raw = await response.text();
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
    if (response.ok && data.success) {
      const refreshed = await renderPollCell(container, data.poll);
      if (!refreshed) location.reload();
    } else {
      alert(data.error || `Vote failed (HTTP ${response.status})`);
    }
  } catch (error) {
    console.error('Vote error:', error);
    alert('Error submitting vote');
  } finally {
    voteButton.disabled = false;
  }
});

async function renderPollCell(container, poll) {
  if (!poll || !Array.isArray(poll.options)) return false;
  try {
    const response = await fetch(`/cells/poll?poll=${encodeURIComponent(JSON.stringify(poll))}`, {
      headers: csrfHeaders({ Accept: 'text/html' })
    });
    if (!response.ok) return false;

    const html = (await response.text()).trim();
    const holder = container.closest('.poll-wrapper');
    if (!holder || !html.startsWith('<div class="poll-wrapper"')) return false;

    holder.outerHTML = html;
    return true;
  } catch (error) {
    console.error('Poll refresh error:', error);
    return false;
  }
}

