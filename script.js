// Register the Service Worker for PWA functionality (relative path for folder hosting)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(registration => {
        console.log('Service Worker registered with scope:', registration.scope);
      })
      .catch(err => {
        console.log('Service Worker registration failed:', err);
      });
  });
}

// --- Config & DOM ---
const apiKey = 'AIzaSyDHP2EWHt-9Pm4_L20lHeVt3Qotb8WYIZU';

const elems = {
  searchInput: document.getElementById('search'),
  clearBtn: document.getElementById('clearSearch'),
  inputGroup: document.getElementById('inputGroup'),
  searchBtn: document.getElementById('searchButton'),
  resultsList: document.getElementById('results'),
  playlistItems: document.getElementById('playlistItems'),
  recentlyPlayedList: document.getElementById('recentlyPlayedList'),
  activePlaylistSelector: document.getElementById('activePlaylistSelector'),
  shareBtn: document.getElementById('sharePlaylistBtn'),
  shareLinkInput: document.getElementById('shareLink'),
  notifyToggle: document.getElementById('notifyToggle'),
  hamburgerMenu: document.querySelector('.hamburger-menu'),
  navLinks: document.getElementById('navLinks'),
  playerWrapper: document.getElementById('playerWrapper'),
  audioPlayer: document.getElementById('audioPlayer'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  audioTitle: document.getElementById('audioTitle'),
  progressBar: document.querySelector('.progress-bar .progress'),
  progressBarContainer: document.querySelector('.progress-bar'),
};

const RESUME_KEY = 'allplay_resume';

// --- State ---
let userPlaylists = JSON.parse(localStorage.getItem('userPlaylists')) || [{ name: 'Default Playlist', songs: [] }];
let activePlaylistName = localStorage.getItem('activePlaylistName') || userPlaylists[0].name;
let activePlaylist = userPlaylists.find(p => p.name === activePlaylistName) || userPlaylists[0];

let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed')) || [];
const MAX_RECENT = 10;

let player = null;
let currentVideoId = null;
let updateProgressBarInterval = null;

// --- YouTube IFrame Player API ---
// IMPORTANT: must be global for https://www.youtube.com/iframe_api
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player(elems.playerWrapper, {
    height: '1',
    width: '1',
    videoId: '',
    playerVars: {
      playsinline: 1,
      autoplay: 1,
      rel: 0,
      controls: 0,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
};

function onPlayerReady() {
  // Restore UI (not autoplay) if we have resume data
  restoreResumeUI();
}

function onPlayerStateChange(event) {
  if (!player) return;

  if (event.data === YT.PlayerState.PLAYING) {
    elems.playPauseBtn.textContent = '⏸';
    elems.audioPlayer.classList.add('active');

    clearInterval(updateProgressBarInterval);
    updateProgressBarInterval = setInterval(updateProgressBar, 1000);

    // Save resume immediately once playing starts
    saveResumeState();

  } else if (event.data === YT.PlayerState.PAUSED) {
    elems.playPauseBtn.textContent = '▶';
    clearInterval(updateProgressBarInterval);
    updateProgressBarInterval = null;
    saveResumeState();

  } else if (event.data === YT.PlayerState.ENDED) {
    elems.playPauseBtn.textContent = '▶';
    clearInterval(updateProgressBarInterval);
    updateProgressBarInterval = null;
    elems.progressBar.style.width = '0%';

    // Auto-next
    playNextFromPlaylist();
  }
}

function updateProgressBar() {
  if (!player || typeof player.getDuration !== 'function') return;

  const duration = player.getDuration();
  if (!duration || duration <= 0) return;

  const currentTime = player.getCurrentTime();
  const progress = (currentTime / duration) * 100;
  elems.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;

  // keep resume updated
  saveResumeState();
}

// --- Initialization ---
window.addEventListener('load', () => {
  elems.notifyToggle.checked = localStorage.getItem('notifyEnabled') === 'true';
  elems.notifyToggle.addEventListener('change', toggleNotifications);

  elems.clearBtn.addEventListener('click', () => {
    elems.searchInput.value = '';
    elems.resultsList.innerHTML = '';
    elems.clearBtn.style.display = 'none';
    elems.inputGroup.classList.remove('active');
  });

  elems.searchInput.addEventListener('input', () => {
    elems.clearBtn.style.display = elems.searchInput.value ? 'inline' : 'none';
    elems.inputGroup.classList.toggle('active', !!elems.searchInput.value);
  });

  elems.searchBtn.addEventListener('click', doSearch);
  elems.searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') doSearch();
  });

  elems.shareBtn.addEventListener('click', handleShare);
  elems.shareLinkInput.addEventListener('click', () => elems.shareLinkInput.select());

  // Play/Pause button:
  // - If we have a resume track but nothing loaded, load + seek on user gesture (iOS-safe).
  elems.playPauseBtn.addEventListener('click', () => {
    if (!player) return alert('Player not ready yet. Try again in 1 second.');

    const state = safeGetResumeState();

    // If we have a currentVideoId but iframe isn't loaded with a video yet
    const loadedVid = player.getVideoData && player.getVideoData()?.video_id;
    if (currentVideoId && (!loadedVid || loadedVid !== currentVideoId) && state?.videoId === currentVideoId) {
      // User gesture -> allowed to start
      player.loadVideoById(currentVideoId);
      elems.audioTitle.textContent = state.title || elems.audioTitle.textContent || 'Resuming...';

      if (typeof state.time === 'number' && state.time > 0) {
        setTimeout(() => {
          try { player.seekTo(state.time, true); } catch {}
        }, 700);
      }
      return;
    }

    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  });

  elems.progressBarContainer.addEventListener('click', e => {
    if (!player || typeof player.getDuration !== 'function') return;
    const duration = player.getDuration();
    if (!duration || duration <= 0) return;

    const totalWidth = elems.progressBarContainer.offsetWidth;
    const clickX = e.offsetX;
    const newTime = (clickX / totalWidth) * duration;
    player.seekTo(newTime, true);
    saveResumeState();
  });

  setupNavigation();

  if (!localStorage.getItem('userPlaylists')) {
    setTimeout(() => {
      if (confirm('No playlists found. Would you like to import a backup from iCloud or Files?')) {
        importPlaylist();
      }
    }, 500);
  }

  loadSharedPlaylist();
  renderAll();
  restoreResumeUI(); // restore UI even before YT is ready
});

// --- Navigation ---
function setupNavigation() {
  elems.navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      elems.navLinks.querySelectorAll('a').forEach(a => a.classList.remove('active'));
      link.classList.add('active');

      const pageId = link.textContent.trim().toLowerCase() + 'Page';
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(pageId)?.classList.add('active');

      elems.navLinks.classList.remove('active');
      elems.hamburgerMenu.classList.remove('open');
    });
  });
}

window.toggleMobileMenu = function () {
  elems.navLinks.classList.toggle('active');
  elems.hamburgerMenu.classList.toggle('open');
};

// Theme (simple)
window.toggleTheme = function () {
  const body = document.body;
  body.setAttribute('data-theme', body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
};

// --- Notifications ---
function toggleNotifications() {
  localStorage.setItem('notifyEnabled', elems.notifyToggle.checked);
  if (elems.notifyToggle.checked && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
}

function notify(title, msg) {
  if (elems.notifyToggle.checked && Notification.permission === 'granted') {
    new Notification(title, { body: msg, icon: './allplay-icon.png' });
  }
}

// --- Youtube Search ---
async function doSearch() {
  const q = elems.searchInput.value.trim();
  if (!q) return alert('Enter something to search.');
  elems.resultsList.innerHTML = '<p id="loadingText">Searching…</p>';
  const lt = document.getElementById('loadingText');
  if (lt) lt.style.display = 'block';

  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(q)}&key=${apiKey}`);
    const data = await res.json();
    renderResults(data.items || []);
    const lt2 = document.getElementById('loadingText');
    if (lt2) lt2.style.display = 'none';
  } catch {
    elems.resultsList.innerHTML = '<p>Error fetching results.</p>';
    const lt2 = document.getElementById('loadingText');
    if (lt2) lt2.style.display = 'none';
  }
}

function renderResults(items) {
  elems.resultsList.innerHTML = items.length
    ? items.map(it => `
      <li data-id="${it.id.videoId}" data-title="${escapeHtml(it.snippet.title)}">
        <div class="content-row">
          <img src="https://img.youtube.com/vi/${it.id.videoId}/default.jpg" alt="thumb"/>
          <p>${escapeHtml(it.snippet.title)}</p>
          <button class="small-btn">Save</button>
        </div>
      </li>`).join('')
    : '<p>No results.</p>';

  elems.resultsList.querySelectorAll('li').forEach(li => {
    const vid = li.dataset.id;
    const title = li.dataset.title;

    li.querySelector('button').onclick = e => {
      e.stopPropagation();
      saveToPlaylist(title, vid);
    };

    li.onclick = () => playAudio(vid, title);
  });
}

// --- Play audio (YouTube API) ---
function playAudio(vid, title) {
  if (!player) {
    // Player not ready yet; still store resume so it can load on first tap
    currentVideoId = vid;
    elems.audioTitle.textContent = title;
    elems.audioPlayer.classList.add('active');
    localStorage.setItem(RESUME_KEY, JSON.stringify({ videoId: vid, title, time: 0, at: Date.now() }));
    return alert('Player loading... tap ▶ again in a moment.');
  }

  // Toggle if same video
  if (currentVideoId === vid) {
    if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
    return;
  }

  currentVideoId = vid;
  elems.audioTitle.textContent = title;
  elems.audioPlayer.classList.add('active');

  // user gesture usually comes from click -> load video
  player.loadVideoById(vid);

  addRecentlyPlayed(title, vid);
  notify('Playing 🎶', title);

  setupMediaSession(title, vid);

  // reset progress UI
  elems.progressBar.style.width = '0%';
  saveResumeState();
}

// --- Media Session ---
function setupMediaSession(title, vid) {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: 'AllPlay',
    album: activePlaylistName || 'Playlist',
    artwork: [
      { src: `https://img.youtube.com/vi/${vid}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
    ]
  });

  navigator.mediaSession.setActionHandler('play', () => player?.playVideo());
  navigator.mediaSession.setActionHandler('pause', () => player?.pauseVideo());

  navigator.mediaSession.setActionHandler('previoustrack', () => {
    const prev = getPrevFromPlaylist();
    if (prev) playAudio(prev.videoId, prev.title);
  });

  navigator.mediaSession.setActionHandler('nexttrack', () => {
    const next = getNextFromPlaylist();
    if (next) playAudio(next.videoId, next.title);
  });
}

// --- Auto-next helpers ---
function getPlaylistIndexByVideoId(vid) {
  if (!activePlaylist || !Array.isArray(activePlaylist.songs)) return -1;
  return activePlaylist.songs.findIndex(s => s.videoId === vid);
}

function getNextFromPlaylist() {
  const idx = getPlaylistIndexByVideoId(currentVideoId);
  if (idx === -1) return null;
  return activePlaylist.songs[idx + 1] || null;
}

function getPrevFromPlaylist() {
  const idx = getPlaylistIndexByVideoId(currentVideoId);
  if (idx <= 0) return null;
  return activePlaylist.songs[idx - 1] || null;
}

function playNextFromPlaylist() {
  const next = getNextFromPlaylist();
  if (!next) return;
  playAudio(next.videoId, next.title);
}

// --- Resume save/restore ---
function saveResumeState() {
  try {
    if (!player || !currentVideoId) return;
    const t = (typeof player.getCurrentTime === 'function') ? player.getCurrentTime() : 0;

    const payload = {
      videoId: currentVideoId,
      title: elems.audioTitle.textContent || '',
      time: Number.isFinite(t) ? t : 0,
      at: Date.now(),
    };

    localStorage.setItem(RESUME_KEY, JSON.stringify(payload));
  } catch {}
}

function safeGetResumeState() {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function restoreResumeUI() {
  const data = safeGetResumeState();
  if (!data?.videoId) return;

  currentVideoId = data.videoId;
  elems.audioTitle.textContent = data.title || 'Resume...';
  elems.audioPlayer.classList.add('active');
  elems.playPauseBtn.textContent = '▶';
}

// --- Playlist management ---
function saveToPlaylist(title, vid) {
  if (activePlaylist.songs.some(s => s.videoId === vid)) {
    return alert('Already in playlist.');
  }
  activePlaylist.songs.push({ title, videoId: vid });
  saveAll();
  renderPlaylist();
  notify('Added to Playlist', title);
}

function renderPlaylist() {
  elems.playlistItems.innerHTML = activePlaylist.songs.length
    ? activePlaylist.songs.map((s, i) => `
      <li data-idx="${i}" data-id="${s.videoId}" data-title="${escapeHtml(s.title)}">
        <div class="content-row">
          <img src="https://img.youtube.com/vi/${s.videoId}/default.jpg" alt="thumb"/>
          <p>${escapeHtml(s.title)}</p>
          <button class="small-btn">Remove</button>
        </div>
      </li>`).join('')
    : '<p>Empty playlist.</p>';

  elems.playlistItems.querySelectorAll('li').forEach(li => {
    const vid = li.dataset.id;
    const title = li.dataset.title;
    const idx = +li.dataset.idx;

    li.querySelector('button').onclick = e => {
      e.stopPropagation();
      activePlaylist.songs.splice(idx, 1);
      saveAll();
      renderPlaylist();
    };

    li.onclick = () => playAudio(vid, title);
  });
}

// --- Recently Played management ---
function addRecentlyPlayed(title, vid) {
  recentlyPlayed = recentlyPlayed.filter(r => r.videoId !== vid);
  recentlyPlayed.unshift({ title, videoId: vid });
  if (recentlyPlayed.length > MAX_RECENT) recentlyPlayed.pop();
  saveAll();
  renderRecentlyPlayed();
}

function renderRecentlyPlayed() {
  elems.recentlyPlayedList.innerHTML = recentlyPlayed.length
    ? recentlyPlayed.map(r => `
      <li data-id="${r.videoId}" data-title="${escapeHtml(r.title)}">
        <div class="content-row">
          <img src="https://img.youtube.com/vi/${r.videoId}/default.jpg" alt="thumb"/>
          <p>${escapeHtml(r.title)}</p>
          <button class="small-btn">Play</button>
        </div>
      </li>`).join('')
    : '<p>No recently played yet.</p>';

  elems.recentlyPlayedList.querySelectorAll('li').forEach(li => {
    const vid = li.dataset.id;
    const title = li.dataset.title;

    li.querySelector('button').onclick = e => {
      e.stopPropagation();
      playAudio(vid, title);
    };

    li.onclick = () => playAudio(vid, title);
  });
}

window.clearRecentlyPlayed = function () {
  if (!confirm('Clear recently played list?')) return;
  recentlyPlayed = [];
  saveAll();
  renderRecentlyPlayed();
};

// --- Playlist CRUD ---
window.createNewPlaylist = function () {
  const name = document.getElementById('newPlaylistName').value.trim();
  if (!name) return alert('Enter playlist name.');
  if (userPlaylists.some(p => p.name === name)) return alert('Playlist already exists.');
  userPlaylists.push({ name, songs: [] });
  activePlaylistName = name;
  activePlaylist = userPlaylists.at(-1);
  saveAll();
  renderAll();
  document.getElementById('newPlaylistName').value = '';
};

window.editActivePlaylistName = function () {
  const newName = prompt('Enter new playlist name:', activePlaylistName)?.trim();
  if (!newName) return;
  if (userPlaylists.some(p => p.name === newName)) return alert('Name already exists.');
  activePlaylist.name = newName;
  activePlaylistName = newName;
  saveAll();
  renderAll();
};

window.deleteActivePlaylist = function () {
  if (userPlaylists.length <= 1) return alert('Cannot delete the only playlist.');
  if (!confirm('Are you sure you want to delete this playlist?')) return;
  userPlaylists = userPlaylists.filter(p => p.name !== activePlaylistName);
  activePlaylist = userPlaylists[0];
  activePlaylistName = activePlaylist.name;
  saveAll();
  renderAll();
};

window.switchActivePlaylist = function (name) {
  activePlaylistName = name;
  activePlaylist = userPlaylists.find(p => p.name === name) || userPlaylists[0];
  saveAll();
  renderPlaylist();
};

// --- Sharing ---
function handleShare() {
  const payload = encodeURIComponent(JSON.stringify(activePlaylist));
  const link = `${location.origin}${location.pathname}?share=${payload}`;
  elems.shareLinkInput.value = link;
  elems.shareLinkInput.style.display = 'block';
  elems.shareLinkInput.select();
  document.execCommand('copy');
  notify('Link copied!', 'Playlist share link copied to clipboard.');
}

function loadSharedPlaylist() {
  const shareParam = new URLSearchParams(location.search).get('share');
  if (!shareParam) return;
  try {
    const shared = JSON.parse(decodeURIComponent(shareParam));
    userPlaylists.push({ name: (shared.name || 'Shared') + ' (Shared)', songs: shared.songs || [] });
    activePlaylist = userPlaylists.at(-1);
    activePlaylistName = activePlaylist.name;
    saveAll();
    renderAll();
    alert(`Loaded shared playlist: ${activePlaylistName}`);
  } catch {
    console.error('Invalid shared playlist data');
  }
}

// --- Export/Import for backup ---
window.exportPlaylist = function () {
  try {
    const data = JSON.stringify(userPlaylists, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'allplay_playlists_backup.json';
    a.click();
    URL.revokeObjectURL(url);
    notify('Exported', 'Playlists exported for backup');
  } catch {
    alert('Failed to export playlists.');
  }
};

window.importPlaylist = function () {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const imported = JSON.parse(text);
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        userPlaylists = imported;
        activePlaylist = userPlaylists[0];
        activePlaylistName = activePlaylist.name;
        saveAll();
        renderAll();
        notify('Imported', 'Playlists imported from backup');
      } catch {
        alert('Invalid backup file.');
      }
    });
  };
  input.click();
};

// --- Save & Render ---
function saveAll() {
  localStorage.setItem('userPlaylists', JSON.stringify(userPlaylists));
  localStorage.setItem('activePlaylistName', activePlaylistName);
  localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
}

function renderAll() {
  elems.activePlaylistSelector.innerHTML = userPlaylists.map(p => `<option>${escapeHtml(p.name)}</option>`).join('');
  elems.activePlaylistSelector.value = activePlaylistName;
  renderPlaylist();
  renderRecentlyPlayed();
}

// --- Utils ---
function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
