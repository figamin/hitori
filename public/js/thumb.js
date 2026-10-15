const PLAYABLE_TYPES = new Set([
  'video/webm',
  'audio/mpeg',
  'video/mp4',
  'video/ogg',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/wav',
  'audio/flac'
]);
const VIDEO_TYPES = new Set(['video/webm', 'video/mp4', 'video/ogg']);
const YT_RE = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
const NICO_RE = /(?:nicovideo\.jp\/watch\/|nico\.ms\/)((?:sm|nm|so|lv)\d+)/i;
const TWEET_RE = /(?:twitter|x|fxtwitter|fixupx|twittpr|fixvx)\.com\/(?:i\/(?:web\/)?|[\w.]+\/)?status(?:es)?\/(\d+)/i;
const BSKY_RE = /(?:bsky\.app|fxbsky\.app|bsky\.social)\/profile\/([\w.:%-]+)\/post\/([a-z0-9]+)/i;
const BILI_BV_RE = /bilibili\.com\/video\/(BV[0-9A-Za-z]{10})/i;
const BILI_AV_RE = /bilibili\.com\/video\/[aA][vV](\d+)/;
const BILI_PAGE_RE = /[?&]p=(\d+)/i;
const BILI_PLAYER_RE = /^https:\/\/player\.bilibili\.com\/player\.html\?/i;
const CYTUBE_RE = /cytu\.be\/r\/([\w-]{1,30})/i;
const TWITCH_CHANNEL_RE = /(?:^|\/\/)(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]+)\/?(?:[?#]|$)/i;
const TWITCH_VOD_RE = /(?:^|\/\/)(?:www\.|m\.)?twitch\.tv\/videos\/(\d+)/i;
const TWITCH_CLIP_RE = /(?:^|\/\/)(?:www\.|m\.)?clips\.twitch\.tv\/([A-Za-z0-9_-]+)/i;
const TWITCH_CHANNEL_CLIP_RE = /(?:^|\/\/)(?:www\.|m\.)?twitch\.tv\/[A-Za-z0-9_]+\/clip\/([A-Za-z0-9_-]+)/i;
const VOCAROO_RE =
  /(?:^|\/\/)(?:[a-z0-9-]+\.)?(?:vocaroo\.com|voca\.ro)\/(?:e(?:mbed)?\/|i\/|mp3\/)?([A-Za-z0-9_-]{8,32})(?:[/?#]|$)/i;
const VOCAROO_MP3_BASE = 'https://media.vocaroo.com/mp3/';
const VOCAROO_EMBED_BASE = 'https://vocaroo.com/embed/';

function vocarooIdFrom(href) {
  const match = String(href || '').match(VOCAROO_RE);
  return match ? match[1] : null;
}

function vocarooFrame(id) {
  const frame = document.createElement('iframe');
  frame.src = VOCAROO_EMBED_BASE + id + '?autoplay=0';
  frame.width = '640';
  frame.height = '150';
  frame.style.maxWidth = '100%';
  frame.style.marginTop = '3px';
  frame.setAttribute('frameborder', '0');
  frame.setAttribute('allow', 'autoplay; encrypted-media');
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  return frame;
}

function vocarooAudio(id) {
  const media = document.createElement('audio');
  media.controls = true;
  media.preload = 'metadata';
  media.style.maxWidth = '100%';
  media.style.marginTop = '3px';
  const source = document.createElement('source');
  source.src = VOCAROO_MP3_BASE + id;
  source.type = 'audio/mpeg';
  media.appendChild(source);
  const fallback = () => {
    if (media.isConnected) media.replaceWith(vocarooFrame(id));
  };
  media.addEventListener('error', fallback, { once: true });
  source.addEventListener('error', fallback, { once: true });
  return media;
}

function embedUrlFor(href) {
  const url = String(href || '');
  const youtube = url.match(YT_RE);
  if (youtube) return 'https://www.youtube.com/embed/' + youtube[1];
  const nicovideo = url.match(NICO_RE);
  if (nicovideo) return 'https://embed.nicovideo.jp/watch/' + nicovideo[1].toLowerCase();

  const bilibili = url.match(BILI_BV_RE) || url.match(BILI_AV_RE);
  if (bilibili) {
    const page = (url.match(BILI_PAGE_RE) || [])[1] || '1';
    const id = bilibili[1].startsWith('BV') ? 'bvid=' + bilibili[1] : 'aid=' + bilibili[1];
    return 'https://player.bilibili.com/player.html?' + id + '&page=' + page + '&high_quality=1';
  }

  return twitchPlayerUrlFor(url);
}

const TWITCH_LOOPBACK_RE = /^(?:localhost|127\.0\.0\.1|\[::1\]|.*\.localhost)$/i;
const TWITCH_FRAME_RE = /^https:\/\/(?:player\.twitch\.tv\/\?|clips\.twitch\.tv\/embed\?)/i;

function twitchFrameRefusalReason() {
  const { protocol, hostname, port } = window.location;
  if (TWITCH_LOOPBACK_RE.test(hostname)) return null;
  if (/^[\d.]+$/.test(hostname) || hostname.startsWith('[')) return 'Twitch does not accept an IP address as an embedding site';
  if (protocol !== 'https:') return 'Twitch only embeds its player on an https page';
  if (port && port !== '443') return `Twitch only embeds its player on the standard https port, and this site is on :${port}`;
  return null;
}

function twitchCanBeFramed() {
  return twitchFrameRefusalReason() === null;
}

function twitchWatchUrlFor(playerUrl) {
  try {
    const url = new URL(playerUrl);
    const channel = url.searchParams.get('channel');
    if (channel) return 'https://www.twitch.tv/' + channel;
    const video = url.searchParams.get('video');
    if (video) return 'https://www.twitch.tv/videos/' + video;
    const clip = url.searchParams.get('clip');
    if (clip) return 'https://clips.twitch.tv/' + clip;
  } catch {
  }
  return null;
}

function twitchEmbedNote(watchUrl, reason) {
  const note = document.createElement('span');
  note.className = 'twitch-embed-note';
  note.textContent = `${reason || 'Twitch will not play in a frame on this page'} - `;
  const link = document.createElement('a');
  link.href = watchUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'watch on twitch.tv';
  note.appendChild(link);
  return note;
}

function fixTwitchFrames(root) {
  const hostname = window.location.hostname;
  const canFrame = twitchCanBeFramed();

  for (const iframe of (root || document).querySelectorAll('iframe[src]')) {
    const src = iframe.getAttribute('src') || '';
    if (!TWITCH_FRAME_RE.test(src)) continue;

    if (!canFrame) {
      const watchUrl = twitchWatchUrlFor(src);
      if (watchUrl) iframe.replaceWith(twitchEmbedNote(watchUrl, twitchFrameRefusalReason()));
      else iframe.remove();
      continue;
    }

    if (!hostname) continue;
    try {
      const url = new URL(src);
      url.searchParams.set('parent', hostname);
      url.searchParams.set('autoplay', 'false');
      const wanted = url.toString();
      if (src !== wanted) iframe.setAttribute('src', wanted);
    } catch {
    }
  }
}

function loadDeferredEmbeds(root) {
  for (const iframe of (root || document).querySelectorAll('iframe[data-src], iframe[src]')) {
    const details = iframe.closest('details');
    const parked = iframe.getAttribute('data-src');
    if (!parked && !BILI_PLAYER_RE.test(iframe.getAttribute('src') || '')) continue;

    const load = () => {
      const src = iframe.getAttribute('data-src');
      if (!src) return;
      iframe.removeAttribute('data-src');
      iframe.setAttribute('src', src);
    };
    const unload = () => {
      const src = iframe.getAttribute('src');
      if (!src) return;
      iframe.setAttribute('data-src', src);
      iframe.removeAttribute('src');
    };

    if (!details) {
      load();
      continue;
    }

    const apply = () => (details.open ? load() : unload());
    if (details.dataset.embedToggle !== 'true') {
      details.dataset.embedToggle = 'true';
      details.addEventListener('toggle', apply);
    }
    apply();
  }
}

function twitchPlayerUrlFor(url) {
  const parent = encodeURIComponent(window.location.hostname);
  const tail = `&parent=${parent}&autoplay=false`;

  const vod = url.match(TWITCH_VOD_RE);
  if (vod) return 'https://player.twitch.tv/?video=' + vod[1] + tail;

  const clip = url.match(TWITCH_CLIP_RE) || url.match(TWITCH_CHANNEL_CLIP_RE);
  if (clip && clip[1].toLowerCase() !== 'embed') {
    return 'https://clips.twitch.tv/embed?clip=' + clip[1] + tail;
  }

  const channel = url.match(TWITCH_CHANNEL_RE);
  if (channel) return 'https://player.twitch.tv/?channel=' + channel[1].toLowerCase() + tail;
  return null;
}

const postVideos = new Map();

function resolvePostVideo(key, apiUrl) {
  const cached = postVideos.get(key);
  if (cached) return cached;

  const pending = fetch(apiUrl)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const post = data && (data.tweet || data.status);
      const media = (post && post.media) || {};
      const videos =
        Array.isArray(media.videos) && media.videos.length
          ? media.videos
          : (media.all || []).filter((item) => item && item.type === 'video');
      const video = videos[0];
      return video ? { url: video.url || null, thumb: video.thumbnail_url || null } : null;
    })
    .catch(() => null)
    .then((media) => {
      if (!media || !media.url) postVideos.delete(key);
      return media;
    });

  postVideos.set(key, pending);
  return pending;
}

function tweetVideoUrl(href) {
  const match = String(href || '').match(TWEET_RE);
  if (!match) return Promise.resolve(null);
  return resolvePostVideo('twitter:' + match[1], 'https://api.fxtwitter.com/i/status/' + match[1]);
}

function blueskyVideoUrl(href) {
  const match = String(href || '').match(BSKY_RE);
  if (!match) return Promise.resolve(null);
  const [handle, rkey] = [match[1], match[2]];
  return resolvePostVideo('bluesky:' + handle + '/' + rkey, 'https://api.fxbsky.app/2/status/' + handle + '/' + rkey);
}

const cytubeRooms = new Map();

const cytubeRoomState = new Map();

function cytubeChannelOf(href) {
  const match = String(href || '').match(CYTUBE_RE);
  return match ? match[1].toLowerCase() : null;
}

function cytubeStreamInfo(channel, { refresh = false } = {}) {
  const cached = cytubeRooms.get(channel);
  if (cached && !refresh) return cached;

  const pending = fetch('/api/cytube/' + encodeURIComponent(channel) + '?live=1')
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

  cytubeRooms.set(channel, pending);
  return pending;
}

function cytubePosition(info) {
  const at = Number(info.currentTime) || 0;
  if (info.paused || !info.positionAt) return at;
  return at + Math.max(0, Date.now() - Number(info.positionAt)) / 1000;
}

function cytubePlayerUrl(info) {
  if (!info.embedUrl) return null;
  const url = new URL(info.embedUrl, window.location.origin);
  const seconds = Math.floor(cytubePosition(info));
  if (info.offsetParam && seconds >= 1) url.searchParams.set(info.offsetParam, String(seconds));
  if (info.provider === 'youtube') {
    url.searchParams.set('enablejsapi', '1');
    url.searchParams.set('origin', window.location.origin);
  }
  return url.toString();
}

function clockText(seconds) {
  const pad = (value) => String(value).padStart(2, '0');
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${minutes}:${pad(total % 60)}`;
}

function cytubeTitleText(info) {
  return info.kind === 'none' ? 'Nothing is playing in this room right now' : 'Now playing: ' + (info.title || 'unknown');
}

function cytubeTimeText(info) {
  if (info.kind === 'none' || !info.seconds) return '';
  return `${clockText(cytubePosition(info))} / ${clockText(info.seconds)}`;
}

const CYTUBE_CLOCK_MIN_MS = 250;
const CYTUBE_CLOCK_MAX_MS = 1000;
const cytubeNotes = new Set();
let cytubeClockTimer = null;

function setCytubeClock(note) {
  const time = note.querySelector('.cytube-time');
  if (!time) return;
  const text = note.cytubeInfo ? cytubeTimeText(note.cytubeInfo) : '';
  const shown = text ? ` \u00b7 ${text}` : '';
  if (time.textContent !== shown) time.textContent = shown;
  time.hidden = !text;
}

function runCytubeClock() {
  cytubeClockTimer = null;
  let wait = null;

  for (const note of [...cytubeNotes]) {
    if (note.isConnected) note.cytubeInPage = true;
    else if (note.cytubeInPage) {
      cytubeNotes.delete(note);
      continue;
    }

    const info = note.cytubeInfo;
    if (!info) continue;
    if (!document.hidden) setCytubeClock(note);
    const next = info.paused ? CYTUBE_CLOCK_MAX_MS : (1 - (cytubePosition(info) % 1)) * CYTUBE_CLOCK_MAX_MS;
    wait = wait === null ? next : Math.min(wait, next);
  }

  if (wait === null) wait = cytubeNotes.size ? CYTUBE_CLOCK_MIN_MS : null;
  if (wait !== null) {
    cytubeClockTimer = setTimeout(runCytubeClock, Math.max(CYTUBE_CLOCK_MIN_MS, Math.min(CYTUBE_CLOCK_MAX_MS, wait)));
  }
}

function updateCytubeNote(note, info) {
  note.cytubeInfo = info;
  const title = note.querySelector('.cytube-title');
  if (title) title.textContent = cytubeTitleText(info);

  setCytubeClock(note);
  cytubeNotes.add(note);
  if (cytubeClockTimer === null) runCytubeClock();
}

const CYTUBE_DRIFT_SECONDS = 15;

const YOUTUBE_SEEK_GRACE_MS = 2500;

const YOUTUBE_ORIGIN = 'https://www.youtube.com';
const youtubePlayers = new WeakMap();

function trackPlayer(media, info) {
  if (!media) return media;
  if (media.tagName === 'IFRAME' && info.provider === 'youtube') trackYouTube(media, info);
  else if (media.tagName === 'VIDEO') guardCytubePosition(media, info.channel);
  return media;
}

let youtubePlayerSeq = 0;

function tellYouTubeListening(iframe) {
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(
    JSON.stringify({ event: 'listening', id: iframe.id, channel: 'widget' }),
    YOUTUBE_ORIGIN
  );
}

function trackYouTube(iframe, info) {
  const track = {
    channel: info.channel,
    seconds: Math.max(0, cytubePosition(info)),
    at: Date.now(),
    playing: false,
    reported: false,
    seekAt: Date.now()
  };
  if (iframe.contentWindow) youtubePlayers.set(iframe.contentWindow, track);

  tellYouTubeListening(iframe);
  iframe.addEventListener('load', () => tellYouTubeListening(iframe));
}

window.addEventListener('message', (event) => {
  if (event.origin !== YOUTUBE_ORIGIN || !event.source) return;
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  const track = youtubePlayers.get(event.source);
  if (!track) return;
  track.reported = true;
  if (message.event !== 'onStateChange') return;
  const now = Date.now();
  if (track.playing) track.seconds += (now - track.at) / 1000;
  track.at = now;
  track.playing = message.info === 1;
  if (message.info === 1 || message.info === 3) dismissYouTubeMove(track, event.source);
});

function commandYouTubeSeek(track, source, target) {
  if (!source || !Number.isFinite(target) || target < 0) return;
  track.seekAt = Date.now();
  track.seconds = target;
  track.at = track.seekAt;
  source.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [Math.floor(target), true] }), YOUTUBE_ORIGIN);
}

function dismissYouTubeMove(track, source) {
  if (!track || Date.now() - track.seekAt < YOUTUBE_SEEK_GRACE_MS) return;
  const room = cytubeRoomState.get(track.channel);
  if (room) commandYouTubeSeek(track, source, cytubePosition(room));
}

function guardCytubePosition(media, channel) {
  media.addEventListener('seeked', () => {
    if (media.cytubeSeeking) {
      media.cytubeSeeking = false;
      return;
    }
    const room = cytubeRoomState.get(channel);
    if (room) restoreCytubePosition(media, room);
  });
  media.addEventListener('play', () => {
    const room = cytubeRoomState.get(channel);
    if (room) restoreCytubePosition(media, room);
  });
}

function restoreCytubePosition(media, info) {
  const target = cytubePosition(info);
  if (!media || !Number.isFinite(target) || target < 0) return;
  media.cytubeSeeking = true;
  try {
    media.currentTime = target;
  } catch {
    media.cytubeSeeking = false;
    return;
  }
  setTimeout(() => {
    if (media) media.cytubeSeeking = false;
  }, 500);
}

function youtubePosition(track) {
  return Math.max(0, track.seconds + (track.playing ? (Date.now() - track.at) / 1000 : 0));
}

function seekCytubeMedia(media, info) {
  const target = cytubePosition(info);
  if (!media || target < 1) return;
  if (!media.isConnected) return;

  if (media.tagName === 'VIDEO') {
    if (media.paused) return;
    if (Math.abs(media.currentTime - target) >= CYTUBE_DRIFT_SECONDS) restoreCytubePosition(media, info);
    return;
  }

  if (media.tagName !== 'IFRAME' || info.provider !== 'youtube') return;
  const track = media.contentWindow && youtubePlayers.get(media.contentWindow);
  if (!track || Date.now() - track.seekAt < YOUTUBE_SEEK_GRACE_MS) return;

  if (!track.reported) return commandYouTubeSeek(track, media.contentWindow, target);

  if (!track.playing) return;
  if (Math.abs(youtubePosition(track) - target) < CYTUBE_DRIFT_SECONDS) return;
  commandYouTubeSeek(track, media.contentWindow, target);
}

const cytubeWatchers = new Map();
const CYTUBE_POLL_MS = 5000;

function watchCytubeBlock(channel, block) {
  let watcher = cytubeWatchers.get(channel);
  if (!watcher) {
    watcher = { channel, blocks: new Set(), timer: null };
    cytubeWatchers.set(channel, watcher);
    watcher.timer = setInterval(() => pollCytubeRoom(watcher), CYTUBE_POLL_MS);
  }
  watcher.blocks.add(block);
  return block;
}

async function pollCytubeRoom(watcher) {
  if (document.hidden) return;

  const info = await cytubeStreamInfo(watcher.channel, { refresh: true });
  for (const block of [...watcher.blocks]) {
    if (!block.alive()) watcher.blocks.delete(block);
    else if (info) block.update(info);
  }

  if (!watcher.blocks.size) {
    clearInterval(watcher.timer);
    cytubeWatchers.delete(watcher.channel);
  }
}

function cytubePlayer(info) {
  const note = document.createElement('div');
  note.className = 'cytube-note';

  const title = document.createElement('span');
  title.className = 'cytube-title';
  note.appendChild(title);

  const time = document.createElement('span');
  time.className = 'cytube-time';
  note.appendChild(time);

  note.appendChild(document.createTextNode(' \u00b7 '));
  const join = document.createElement('a');
  join.href = info.roomUrl;
  join.target = '_blank';
  join.rel = 'noopener noreferrer';
  join.textContent = 'Join the room';
  note.appendChild(join);
  if (info.note) note.appendChild(document.createTextNode(' (' + info.note + ')'));
  updateCytubeNote(note, info);

  if (info.kind === 'embed' && info.embedUrl) {
    const iframe = document.createElement('iframe');
    iframe.id = `cytube-player-${(youtubePlayerSeq += 1)}`;
    iframe.width = '640';
    iframe.height = '360';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.style.maxWidth = '100%';
    iframe.src = cytubePlayerUrl(info) || info.embedUrl;
    return { note, media: iframe };
  }

  if (info.kind === 'video' && info.videoUrl) {
    const video = document.createElement('video');
    video.controls = true;
    video.style.maxWidth = '100%';
    const source = document.createElement('source');
    source.src = info.videoUrl;
    if (info.mime) source.type = info.mime;
    video.appendChild(source);
    if (info.currentTime > 0) {
      const seek = () => {
        try {
          video.currentTime = cytubePosition(info);
        } catch {
        }
      };
      if (video.readyState >= 1) seek();
      else video.addEventListener('loadedmetadata', seek, { once: true });
    }
    return { note, media: video };
  }

  return { note, media: null };
}

function refreshCytubeBlockMeta(container, info) {
  const block = container.closest('details');
  if (!block) return;

  const label = block.querySelector('.cytube-now-playing');
  if (label) label.textContent = info.kind === 'none' ? 'nothing playing now' : info.title || 'unknown';

  const poster = block.querySelector('.image-container img');
  if (poster && info.coverUrl && poster.getAttribute('src') !== info.coverUrl) {
    poster.setAttribute('src', info.coverUrl);
    poster.setAttribute('data-thumb', info.coverUrl);
  }
}

function mountCytubeBlock(container) {
  const channel = (container.dataset.channel || '').toLowerCase();
  if (!channel) return;

  const fallback = container.querySelector('.cytube-play');
  container.dataset.cytubeMounted = 'true';
  container.textContent = 'Reading the room\u2026';

  let shown = null;
  let media = null;

  const render = (info) => {
    const player = cytubePlayer(info);
    container.textContent = '';
    container.appendChild(player.note);
    if (player.media) container.appendChild(player.media);
    else if (info.kind !== 'none' && fallback) container.appendChild(fallback);
    media = trackPlayer(player.media, info);
  };

  const apply = (info) => {
    if (!info) {
      container.textContent = '';
      if (fallback) container.appendChild(fallback);
      return;
    }

    cytubeRoomState.set(channel, info);
    const key = info.kind === 'none' ? 'idle' : `${info.type}:${info.mediaId}`;
    if (key !== shown) {
      shown = key;
      return render(info);
    }

    const note = container.querySelector('.cytube-note');
    if (note) updateCytubeNote(note, info);
    seekCytubeMedia(media, info);
  };

  cytubeStreamInfo(channel).then(apply);
  watchCytubeBlock(channel, { alive: () => container.isConnected, update: apply });
}

function isModifiedClick(e) {
  return e.which === 2 || e.ctrlKey;
}
function makeHideLink() {
  const a = document.createElement('a');
  a.textContent = '[ - ]';
  a.className = 'hide-link';
  a.style.cursor = 'pointer';
  a.style.display = 'none';
  return a;
}

function cloneThumbLink(link, mime) {
  const a = document.createElement('a');
  a.href = link.href;
  a.className = link.className;
  a.dataset.mime = mime;
  if (link.dataset.fileWidth) a.dataset.fileWidth = link.dataset.fileWidth;
  if (link.dataset.fileHeight) a.dataset.fileHeight = link.dataset.fileHeight;
  const img = link.querySelector('img');
  if (img) {
    const thumb = img.cloneNode(true);
    thumb.style.cursor = 'pointer';
    a.appendChild(thumb);
  }
  return a;
}

function wireToggle(parent, thumbLink, media, hideLink, onShow, onHide) {
  hideLink.onclick = () => {
    parent.classList.remove('expanded-cell');
    thumbLink.style.display = 'inline';
    media.style.display = 'none';
    hideLink.style.display = 'none';
    onHide?.();
  };
  thumbLink.onclick = (e) => {
    if (isModifiedClick(e)) return true;
    parent.classList.add('expanded-cell');
    thumbLink.style.display = 'none';
    media.style.display = 'inline';
    hideLink.style.display = 'inline';
    onShow?.();
    return false;
  };
}

const thumbs = {
  expandImage(e, link, mime) {
    if (isModifiedClick(e)) return true;

    const parent = link.parentNode;
    const thumb = link.querySelector('img');
    if (!thumb) return false;

    let expanded = link.querySelector('.img-expanded');

    if (thumb.style.display === 'none') {
      parent.classList.remove('expanded-cell');
      if (expanded) expanded.style.display = 'none';
      thumb.style.display = '';
      if (thumb.getBoundingClientRect().top < 0) thumb.scrollIntoView();
      return false;
    }

    parent.classList.add('expanded-cell');
    if (expanded) {
      thumb.style.display = 'none';
      expanded.style.display = '';
      return false;
    }

    if (thumb.src === link.href && mime !== 'image/svg+xml') return false;

    parent.querySelector('.img-unsupported')?.remove();
    expanded = document.createElement('img');
    expanded.src = link.href;
    expanded.className = 'img-expanded';
    expanded.addEventListener('error', () => {
      expanded.remove();
      thumb.style.display = '';
      parent.classList.remove('expanded-cell');
      const open = document.createElement('a');
      open.href = link.href;
      open.textContent = 'open the file';
      open.addEventListener('click', (e) => e.stopPropagation());
      const notice = document.createElement('span');
      notice.className = 'img-unsupported';
      notice.append("This browser can't show this picture - ", open);
      parent.appendChild(notice);
    });
    thumb.style.display = 'none';
    link.appendChild(expanded);
    return false;
  },

  setPlayer(link, mime, autoExpand) {
    const parent = link.parentNode;
    const isVideo = VIDEO_TYPES.has(mime);
    const media = document.createElement(isVideo ? 'video' : 'audio');
    if (isVideo) media.loop = localStorage.noAutoLoop !== 'true';
    media.controls = true;
    media.style.display = 'none';

    const container = document.createElement('span');
    const hideLink = makeHideLink();
    const thumbLink = cloneThumbLink(link, mime);
    const src = document.createElement('source');
    src.src = link.href;
    src.type = mime;

    wireToggle(
      parent,
      thumbLink,
      media,
      hideLink,
      () => {
        if (!media.querySelector('source')) media.appendChild(src);
        media.play();
      },
      () => media.pause()
    );

    container.append(hideLink, media, thumbLink);
    parent.replaceChild(container, link);
    if (autoExpand) thumbLink.onclick({ which: 1 });
  },

  setTwitchLink(link, mime, autoExpand) {
    const parent = link.parentNode;
    const container = document.createElement('span');
    const hideLink = makeHideLink();
    const thumbLink = cloneThumbLink(link, mime);
    const panel = document.createElement('span');
    panel.style.display = 'none';
    panel.appendChild(twitchEmbedNote(twitchWatchUrlFor(embedUrlFor(link.href)) || link.href, twitchFrameRefusalReason()));

    wireToggle(parent, thumbLink, panel, hideLink);
    container.append(hideLink, panel, thumbLink);
    parent.replaceChild(container, link);
    if (autoExpand) thumbLink.onclick({ which: 1 });
  },

  setEmbedVideo(link, mime, autoExpand) {
    const embedUrl = embedUrlFor(link.href);
    if (!embedUrl) return;

    if (mime === 'twitch/video' && !twitchCanBeFramed()) return this.setTwitchLink(link, mime, autoExpand);

    const parent = link.parentNode;
    const container = document.createElement('span');
    const hideLink = makeHideLink();
    const thumbLink = cloneThumbLink(link, mime);
    const iframe = document.createElement('iframe');
    iframe.width = '640';
    iframe.height = '360';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.style.maxWidth = '100%';
    iframe.style.display = 'none';

    wireToggle(
      parent,
      thumbLink,
      iframe,
      hideLink,
      () => {
        if (!iframe.src) iframe.src = embedUrl;
      },
      () => {
        iframe.removeAttribute('src');
      }
    );

    container.append(hideLink, iframe, thumbLink);
    parent.replaceChild(container, link);
    if (autoExpand) thumbLink.onclick({ which: 1 });
  },

  setVocarooAudio(link, mime, autoExpand) {
    const id = vocarooIdFrom(link.href);
    if (!id) return this.setEmbedVideo(link, mime, autoExpand);

    const parent = link.parentNode;
    const media = vocarooAudio(id);
    media.style.display = 'none';

    const container = document.createElement('span');
    const hideLink = makeHideLink();
    const thumbLink = cloneThumbLink(link, mime);

    wireToggle(
      parent,
      thumbLink,
      media,
      hideLink,
      () => media.play().catch(() => {}),
      () => media.pause()
    );

    container.append(hideLink, media, thumbLink);
    parent.replaceChild(container, link);
    if (autoExpand) thumbLink.onclick({ which: 1 });
  },

  setPostVideo(link, mime, autoExpand) {
    const resolve = mime === 'bluesky/video' ? blueskyVideoUrl : tweetVideoUrl;
    const parent = link.parentNode;
    const media = document.createElement('video');
    media.controls = true;
    media.loop = localStorage.noAutoLoop !== 'true';
    media.style.display = 'none';

    const container = document.createElement('span');
    const hideLink = makeHideLink();
    const thumbLink = cloneThumbLink(link, mime);
    let loaded = false;

    wireToggle(
      parent,
      thumbLink,
      media,
      hideLink,
      () => {
        resolve(link.href).then((post) => {
          if (!post || !post.url) {
            if (!loaded) window.location.href = link.href;
            return;
          }
          if (!loaded) {
            const src = document.createElement('source');
            src.src = post.url;
            src.type = 'video/mp4';
            media.appendChild(src);
            loaded = true;
          }
        });
      },
      () => media.pause()
    );

    container.append(hideLink, media, thumbLink);
    parent.replaceChild(container, link);
    if (autoExpand) thumbLink.onclick({ which: 1 });
  },

  setCytubeStream(link, mime, autoExpand) {
    const channel = cytubeChannelOf(link.href);
    if (!channel) return;

    const parent = link.parentNode;
    const container = document.createElement('span');
    const hideLink = makeHideLink();
    const thumbLink = cloneThumbLink(link, mime);
    const panel = document.createElement('div');
    panel.className = 'cytube-stream';
    panel.textContent = 'Reading the room\u2026';
    panel.style.display = 'none';

    let info = null;
    let media = null;
    let active = false;

    const mount = (data) => {
      const player = cytubePlayer(data);
      refreshCytubeBlockMeta(container, data);
      panel.textContent = '';
      panel.appendChild(player.note);
      media = player.media;
      if (media) panel.appendChild(media);
      trackPlayer(media, data);
    };

    const showRoomLink = () => {
      const fallback = document.createElement('a');
      fallback.href = link.href;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      fallback.textContent = 'Open the room on cytu.be';
      panel.textContent = '';
      panel.appendChild(fallback);
    };

    const apply = (data, { remount = false } = {}) => {
      if (!data) return showRoomLink();
      const changed = !info || data.type !== info.type || data.mediaId !== info.mediaId;
      info = data;
      cytubeRoomState.set(channel, data);
      refreshCytubeBlockMeta(container, data);
      if (!active) return; 
      if (remount || changed) return mount(data);
      const note = panel.querySelector('.cytube-note');
      if (note) updateCytubeNote(note, data);
      seekCytubeMedia(media, data);
    };

    wireToggle(
      parent,
      thumbLink,
      panel,
      hideLink,
      () => {
        active = true;
        cytubeStreamInfo(channel, { refresh: true }).then((data) => apply(data || info, { remount: true }));
      },
      () => {
        active = false;
        if (!media) return;
        if (media.tagName === 'IFRAME') media.removeAttribute('src');
        else media.pause();
      }
    );

    container.append(hideLink, panel, thumbLink);
    parent.replaceChild(container, link);
    if (autoExpand) thumbLink.onclick({ which: 1 });
    watchCytubeBlock(channel, { alive: () => container.isConnected, update: apply });
  },

  mountVocarooBlock(container) {
    const id = vocarooIdFrom(container.dataset.url);
    if (!id) return;
    container.dataset.vocarooMounted = 'true';

    const details = container.closest('details');
    let mounted = false;
    const mount = () => {
      if (mounted) return;
      mounted = true;
      container.textContent = '';
      container.appendChild(vocarooAudio(id));
    };

    if (!details) return mount();
    if (details.open) return mount();
    details.addEventListener('toggle', () => details.open && mount(), { once: true });
  },

  mountPostVideoBlock(container) {
    const postUrl = container.dataset.url;
    if (!postUrl) return;
    container.dataset.postVideoMounted = 'true';

    const details = container.closest('details');
    let asked = false;
    const show = () => {
      if (asked) return;
      asked = true;
      const resolve = container.dataset.provider === 'bluesky' ? blueskyVideoUrl : tweetVideoUrl;
      resolve(postUrl).then((media) => {
        if (!media || !media.url) return; 
        const video = document.createElement('video');
        video.controls = true;
        video.preload = 'metadata';
        if (media.thumb) video.poster = media.thumb;
        const source = document.createElement('source');
        source.src = media.url;
        source.type = 'video/mp4';
        video.appendChild(source);
        container.textContent = '';
        container.appendChild(video);
      });
    };

    if (!details) return show();
    if (details.open) return show();
    details.addEventListener('toggle', () => details.open && show(), { once: true });
  },

  processImageLink(link) {
    const mime = link.getAttribute('data-mime') || '';
    if (mime.startsWith('image/')) {
      link.addEventListener('click', (e) => {
        if (isModifiedClick(e)) return;
        e.preventDefault();
        this.expandImage(e, link, mime);
      });
    } else if (PLAYABLE_TYPES.has(mime)) {
      link.addEventListener(
        'click',
        (e) => {
          if (isModifiedClick(e)) return;
          e.preventDefault();
          this.setPlayer(link, mime, true);
        },
        { once: true }
      );
    } else if (mime === 'twitter/video' || mime === 'bluesky/video') {
      link.addEventListener(
        'click',
        (e) => {
          if (isModifiedClick(e)) return;
          e.preventDefault();
          this.setPostVideo(link, mime, true);
        },
        { once: true }
      );
    } else if (mime === 'cytube/stream') {
      this.setCytubeStream(link, mime, true);
    } else if (mime === 'vocaroo/audio') {
      link.addEventListener(
        'click',
        (e) => {
          if (isModifiedClick(e)) return;
          e.preventDefault();
          this.setVocarooAudio(link, mime, true);
        },
        { once: true }
      );
    } else if (mime === 'youtube/video' || mime === 'nicovideo/video' || mime === 'bilibili/video' || mime === 'twitch/video') {
      link.addEventListener(
        'click',
        (e) => {
          if (isModifiedClick(e)) return;
          e.preventDefault();
          this.setEmbedVideo(link, mime, true);
        },
        { once: true }
      );
    }
  }
};

window.initializeThumbnails = function () {
  fixTwitchFrames(document);

  loadDeferredEmbeds(document);

  document.querySelectorAll('.image-container:not([data-initialized])').forEach((container) => {
    const link = container.querySelector('.media-toggle');
    if (!link) return;
    container.dataset.initialized = 'true';
    thumbs.processImageLink(link);
  });

  document.querySelectorAll('.cytube-stream:not([data-cytube-mounted])').forEach((container) => {
    if (container.querySelector('.cytube-play')) mountCytubeBlock(container);
  });

  document.querySelectorAll('.post-video:not([data-post-video-mounted])').forEach((container) => {
    if (container.querySelector('.post-video-play')) thumbs.mountPostVideoBlock(container);
  });

  document.querySelectorAll('.vocaroo-embed:not([data-vocaroo-mounted])').forEach((container) => {
    if (container.querySelector('.vocaroo-embed-play')) thumbs.mountVocarooBlock(container);
  });
};

window.thumbs = thumbs;

(function () {
  const MARGIN = 13.3333;

  let hoverPreview = null;
  let hoverPreviewParams = null;
  let bound = false;
  let enabled = false;
  let follow = false;
  let restrict = false;

  function refreshFlags() {
    enabled = localStorage.getItem('imagePreviewHover') === 'true';
    follow = localStorage.getItem('imagePreviewFollowCursor') === 'true';
    restrict = localStorage.getItem('imagePreviewRestrictSize') === 'true';
  }

  function headerHeight() {
    const header = document.querySelector('.header');
    return header ? header.offsetHeight : 24;
  }

  function getHoverTarget(el) {
    if (!(el instanceof Element)) return null;
    const img = el.closest('.thread-image, .reply-image, .catalog-image');
    if (!img || img.style.display === 'none') return null;
    const link = img.closest('.media-toggle');
    if (!link) return null;
    const mime = link.getAttribute('data-mime') || '';
    if (!mime.startsWith('image/')) return null;
    const expanded = link.querySelector('.img-expanded');
    if (expanded && expanded.style.display !== 'none' && expanded.src) return null;
    const full = img.dataset.full || link.getAttribute('href');
    if (!full || full === img.getAttribute('src')) return null;
    return { link, img, full };
  }

  function getFileDimensions(link, img) {
    let fileWidth = parseInt(link.dataset.fileWidth, 10);
    let fileHeight = parseInt(link.dataset.fileHeight, 10);
    if (fileWidth > 0 && fileHeight > 0) return { fileWidth, fileHeight };
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      return { fileWidth: img.naturalWidth, fileHeight: img.naturalHeight };
    }
    return {
      fileWidth: parseInt(img.getAttribute('width'), 10) || 200,
      fileHeight: parseInt(img.getAttribute('height'), 10) || 200
    };
  }

  function updateHoverPreviewPosition(clientX, clientY) {
    if (!hoverPreview || !hoverPreviewParams) return;

    const { thumb, rect, fileWidth, fileHeight, headerH } = hoverPreviewParams;
    const margin = MARGIN * (clientX === undefined ? 1 : 2);
    const { clientWidth, clientHeight } = document.documentElement;

    const startLeft = clientX === undefined ? rect.left : clientX;
    const startRight = clientX === undefined ? rect.right : clientX;
    const spaceLeft = startLeft - margin * 2;
    const spaceRight = clientWidth - startRight - margin * 2;
    const appearLeft = spaceLeft > spaceRight;
    const maxHoverW = restrict ? (appearLeft ? spaceLeft : spaceRight) : clientWidth - margin * 2;
    const maxHoverH = clientHeight - headerH - margin * 2;
    const scale = Math.min(1, maxHoverW / fileWidth, maxHoverH / fileHeight);

    hoverPreview.style.maxWidth = `${maxHoverW}px`;
    hoverPreview.style.maxHeight = `${maxHoverH}px`;
    hoverPreview.style.left = '';
    hoverPreview.style.right = '';

    if (appearLeft) {
      if (restrict || fileWidth * scale < spaceLeft) {
        hoverPreview.style.right = `${clientWidth - startLeft + margin}px`;
      } else {
        hoverPreview.style.left = `${margin}px`;
      }
    } else if (restrict || fileWidth * scale < spaceRight) {
      hoverPreview.style.left = `${startRight + margin}px`;
    } else {
      hoverPreview.style.right = `${clientWidth - maxHoverW - margin}px`;
    }

    const hoverHeight = fileHeight * scale;
    const wantedTop =
      clientY !== undefined ? clientY - hoverHeight / 2 : rect.top + thumb.offsetHeight / 2 - hoverHeight / 2;
    const minTop = headerH + margin;
    const maxTop = clientHeight - hoverHeight - margin;
    hoverPreview.style.top = `${wantedTop < minTop ? minTop : wantedTop > maxTop ? maxTop : wantedTop}px`;
  }

  function hideHoverPreview() {
    hoverPreview?.remove();
    hoverPreview = null;
    hoverPreviewParams = null;
    document.removeEventListener('pointermove', onHoverMove);
  }

  function onHoverMove(e) {
    const { clientX, clientY } = e;
    if (hoverPreview && hoverPreviewParams?.thumb?.contains(document.elementFromPoint(clientX, clientY))) {
      if (follow) updateHoverPreviewPosition(clientX, clientY);
      return;
    }
    hideHoverPreview();
  }

  function onImgLinkHover(data) {
    const { link, img, full } = data;
    const { fileWidth, fileHeight } = getFileDimensions(link, img);
    if (!fileWidth || !fileHeight) return;

    hideHoverPreview();

    hoverPreviewParams = {
      thumb: img,
      link,
      rect: img.getBoundingClientRect(),
      fileWidth,
      fileHeight,
      headerH: headerHeight()
    };

    hoverPreview = document.createElement('img');
    hoverPreview.className = 'hover-preview';
    hoverPreview.onerror = () => hideHoverPreview();
    hoverPreview.src = full;
    document.body.append(hoverPreview);
    updateHoverPreviewPosition();
    document.addEventListener('pointermove', onHoverMove);
  }

  function onPointerEnter(e) {
    if (!enabled) return;
    const data = getHoverTarget(e.target);
    if (data) onImgLinkHover(data);
  }

  function onDocumentPointerLeave(e) {
    if (e.relatedTarget === null) hideHoverPreview();
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('pointerenter', onPointerEnter, true);
    document.addEventListener('click', hideHoverPreview, true);
    document.documentElement.addEventListener('pointerleave', onDocumentPointerLeave);
  }

  function unbind() {
    if (!bound) return;
    bound = false;
    document.removeEventListener('pointerenter', onPointerEnter, true);
    document.removeEventListener('click', hideHoverPreview, true);
    document.documentElement.removeEventListener('pointerleave', onDocumentPointerLeave);
    hideHoverPreview();
  }

  window.imagePreview = {
    update() {
      refreshFlags();
      if (enabled) bind();
      else unbind();
    }
  };
})();

function initThumbPage() {
  initializeThumbnails();
  window.imagePreview.update();
}

document.addEventListener('DOMContentLoaded', initThumbPage);
document.addEventListener('contentAdded', initializeThumbnails);
