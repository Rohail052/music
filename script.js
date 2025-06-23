const apiKey = 'AIzaSyDHP2EWHt-9Pm4_L20lHeVt3Qotb8WYIZU'; // Replace with your own API key

const elems = {
  searchInput: document.getElementById('search'),
  clearBtn: document.getElementById('clearSearch'),
  inputGroup: document.getElementById('inputGroup'),
  searchBtn: document.getElementById('searchButton'),
  resultsList: document.getElementById('results'),
  playlistItems: document.getElementById('playlistItems'),
  recentlyPlayedList: document.getElementById('recentlyPlayedList'),
  activePlaylistSelector: document.getElementById('activePlaylistSelector'),
  notifyToggle: document.getElementById('notifyToggle'),
  audioOnlyToggle: document.getElementById('audioOnlyToggle'),
  navLinks: document.getElementById('navLinks'),
  hamburgerMenu: document.querySelector('.hamburger-menu'),
};

let userPlaylists = JSON.parse(localStorage.getItem('userPlaylists')) || [{ name: 'Default Playlist', songs: [] }];
let activePlaylistName = localStorage.getItem('activePlaylistName') || userPlaylists[0].name;
let activePlaylist = userPlaylists.find(p => p.name === activePlaylistName);
let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed')) || [];
const MAX_RECENT = 10;

let currentPlayer = null;        // either container div or hidden iframe element
let currentPlayerParent = null;  // the <li> element where player shown

window.addEventListener('load', () => {
  elems.notifyToggle.checked = localStorage.getItem('notifyEnabled') === 'true';

  renderAll();
  setupNav();
  setupSearch();
  setupClearButton();
  setupNotifyToggle();
});

function setupNav() {
  const links = elems.navLinks.querySelectorAll('a');
  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      links.forEach(a => a.classList.remove('active'));
      link.classList.add('active');
      const pageId = link.textContent.trim().toLowerCase() + 'Page';
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const pageToShow = document.getElementById(pageId);
      if (pageToShow) pageToShow.classList.add('active');
      elems.navLinks.classList.remove('active');
      elems.hamburgerMenu.classList.remove('open');

      if (pageId !== 'homePage') {
        removeCurrentPlayer();
      }
    });
  });
}

function setupSearch() {
  elems.searchBtn.addEventListener('click', doSearch);
  elems.searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });
  elems.audioOnlyToggle.addEventListener('change', () => {
    if (currentPlayerParent) {
      const vid = currentPlayerParent.dataset.id;
      const title = currentPlayerParent.dataset.title;
      if (vid && title) playVideo(vid, title, currentPlayerParent);
    }
  });
}

function setupClearButton() {
  elems.searchInput.addEventListener('input', () => {
    elems.clearBtn.style.display = elems.searchInput.value ? 'inline' : 'none';
  });
  elems.clearBtn.addEventListener('click', () => {
    elems.searchInput.value = '';
    elems.clearBtn.style.display = 'none';
    elems.resultsList.innerHTML = '';
  });
}

function setupNotifyToggle() {
  elems.notifyToggle.addEventListener('change', () => {
    localStorage.setItem('notifyEnabled', elems.notifyToggle.checked);
    if (elems.notifyToggle.checked && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  });
}

function notify(title, msg) {
  if (elems.notifyToggle.checked && Notification.permission === 'granted') {
    new Notification(title, { body: msg, icon: './allplay-icon.png' });
  }
}

// --- Search ---
async function doSearch() {
  const q = elems.searchInput.value.trim();
  if (!q) return alert('Enter something to search.');
  elems.resultsList.innerHTML = '';
  showLoading(true);

  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(q)}&key=${apiKey}`);
    const data = await res.json();
    showLoading(false);
    renderResults(data.items || []);
  } catch {
    showLoading(false);
    elems.resultsList.innerHTML = '<li>Error fetching results.</li>';
  }
}

function showLoading(show) {
  const loadingText = document.getElementById('loadingText');
  loadingText.style.display = show ? 'block' : 'none';
}

function renderResults(items) {
  elems.resultsList.innerHTML = items.length
    ? items.map(it => `
      <li tabindex="0" data-id="${it.id.videoId}" data-title="${escapeHtml(it.snippet.title)}">
        <div class="song-title">
          <img src="https://img.youtube.com/vi/${it.id.videoId}/default.jpg" alt="thumb" />
          <p>${escapeHtml(it.snippet.title)}</p>
          <button aria-label="Save ${escapeHtml(it.snippet.title)} to playlist">Save</button>
        </div>
        <div class="player-container"></div>
      </li>`).join('')
    : '<p>No results.</p>';

  elems.resultsList.querySelectorAll('li').forEach(li => {
    const vid = li.dataset.id, title = li.dataset.title;
    const saveBtn = li.querySelector('button');
    saveBtn.onclick = e => {
      e.stopPropagation();
      saveToPlaylist(title, vid);
    };
    li.querySelector('.song-title').onclick = () => playVideo(vid, title, li);
  });
}

// --- Escape HTML ---
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Player Handling ---
function removeCurrentPlayer() {
  if (currentPlayer) {
    if (currentPlayer.tagName === 'IFRAME') {
      // Audio-only iframe appended to body
      currentPlayer.remove();
    } else if (currentPlayer.classList && currentPlayer.classList.contains('player-container')) {
      // Normal container div inside li
      currentPlayer.innerHTML = '';
      currentPlayer.classList.remove('show', 'audio-only-text');
    }
    currentPlayer = null;
  }
  if (currentPlayerParent) {
    currentPlayerParent = null;
  }
}

function playVideo(vid, title, parentLi) {
  removeCurrentPlayer();

  const isAudioOnly = elems.audioOnlyToggle.checked;
  const container = parentLi.querySelector('.player-container');

  if (isAudioOnly) {
    // Audio-only: create hidden iframe appended to body, show "Audio Playing" text in container
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0&mute=0&enablejsapi=1`;
    iframe.style.display = 'none';
    iframe.setAttribute('allow', 'autoplay; encrypted-media');
    iframe.setAttribute('allowfullscreen', '');
    iframe.dataset.videoId = vid;

    document.body.appendChild(iframe);

    container.textContent = '🎧 Audio Playing';
    container.classList.add('audio-only-text', 'show');

    currentPlayer = iframe;
    currentPlayerParent = parentLi;

  } else {
    // Normal video iframe visible in container below title
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`;
    iframe.setAttribute('allow', 'autoplay; encrypted-media');
    iframe.setAttribute('allowfullscreen', '');
    iframe.dataset.videoId = vid;

    container.appendChild(iframe);
    container.classList.add('show');

    currentPlayer = container;
    currentPlayerParent = parentLi;
  }

  // Highlight the playing li item
  document.querySelectorAll('li').forEach(li => li.classList.remove('playing'));
  parentLi.classList.add('playing');

  addRecentlyPlayed(title, vid);
  notify('Playing 🎶', title);
}

// --- Playlist Management ---
function saveToPlaylist(title, vid) {
  if (activePlaylist.songs.some(s => s.videoId === vid)) {
    alert('Already in playlist.');
    return;
  }
  activePlaylist.songs.push({ title, videoId: vid, favorite: false });
  saveAll();
  renderPlaylist();
  notify('Added to Playlist', title);
}

function renderPlaylist() {
  elems.playlistItems.innerHTML = activePlaylist.songs.length
    ? activePlaylist.songs.map((s, i) => `
      <li tabindex="0" data-idx="${i}" data-id="${s.videoId}" data-title="${escapeHtml(s.title)}">
        <div class="song-title" style="cursor:pointer; display:flex; align-items:center; gap: 15px;">
          <img src="https://img.youtube.com/vi/${s.videoId}/default.jpg" alt="thumb" />
          <p style="flex:1;">${escapeHtml(s.title)}</p>
          <button title="Toggle Favorite">${s.favorite ? '★' : '☆'}</button>
          <button title="Remove">Remove</button>
        </div>
        <div class="player-container"></div>
      </li>`).join('')
    : '<p>Empty playlist.</p>';

  elems.playlistItems.querySelectorAll('li').forEach(li => {
    const vid = li.dataset.id, title = li.dataset.title, idx = +li.dataset.idx;
    const favBtn = li.querySelector('button[title="Toggle Favorite"]');
    const remBtn = li.querySelector('button[title="Remove"]');
    const song = activePlaylist.songs[idx];

    favBtn.onclick = e => {
      e.stopPropagation();
      song.favorite = !song.favorite;
      saveAll();
      renderPlaylist();
    };
    remBtn.onclick = e => {
      e.stopPropagation();
      activePlaylist.songs.splice(idx, 1);
      saveAll();
      renderPlaylist();
    };

    li.querySelector('.song-title').onclick = () => playVideo(vid, title, li);
  });
}

// --- Recently Played ---
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
      <li tabindex="0" data-id="${r.videoId}" data-title="${escapeHtml(r.title)}">
        <div class="song-title">
          <img src="https://img.youtube.com/vi/${r.videoId}/default.jpg" alt="thumb" />
          <p>${escapeHtml(r.title)}</p>
          <button aria-label="Play ${escapeHtml(r.title)}">Play</button>
        </div>
        <div class="player-container"></div>
      </li>`).join('')
    : '<p>No recently played yet.</p>';

  elems.recentlyPlayedList.querySelectorAll('li').forEach(li => {
    const vid = li.dataset.id, title = li.dataset.title;
    li.querySelector('button').onclick = e => {
      e.stopPropagation();
      playVideo(vid, title, li);
    };
    li.querySelector('.song-title').onclick = () => playVideo(vid, title, li);
  });
}

function clearRecentlyPlayed() {
  if (!confirm('Clear recently played list?')) return;
  recentlyPlayed = [];
  saveAll();
  renderRecentlyPlayed();
}

// --- Playlist CRUD ---
function createNewPlaylist() {
  const nameInput = document.getElementById('newPlaylistName');
  const name = nameInput.value.trim();
  if (!name) return alert('Enter playlist name.');
  if (userPlaylists.some(p => p.name === name)) return alert('Playlist already exists.');
  userPlaylists.push({ name, songs: [] });
  activePlaylistName = name;
  activePlaylist = userPlaylists.at(-1);
  saveAll();
  renderAll();
  nameInput.value = '';
}

function editActivePlaylistName() {
  const newName = prompt('Enter new playlist name:', activePlaylistName)?.trim();
  if (!newName) return;
  if (userPlaylists.some(p => p.name === newName)) return alert('Name already exists.');
  activePlaylist.name = newName;
  activePlaylistName = newName;
  saveAll();
  renderAll();
}

function deleteActivePlaylist() {
  if (userPlaylists.length <= 1) return alert('Cannot delete the only playlist.');
  if (!confirm('Are you sure you want to delete this playlist?')) return;
  userPlaylists = userPlaylists.filter(p => p.name !== activePlaylistName);
  activePlaylist = userPlaylists[0];
  activePlaylistName = activePlaylist.name;
  saveAll();
  renderAll();
}

function switchActivePlaylist(name) {
  activePlaylistName = name;
  activePlaylist = userPlaylists.find(p => p.name === name);
  saveAll();
  renderPlaylist();
}

// --- Share ---
function handleShare() {
  const payload = encodeURIComponent(JSON.stringify(activePlaylist));
  const link = `${location.origin}${location.pathname}?share=${payload}`;
  alert('Shareable Link (copied to clipboard):\n\n' + link);
  navigator.clipboard.writeText(link).catch(() => {});
}
function loadSharedPlaylist() {
  const shareParam = new URLSearchParams(location.search).get('share');
  if (!shareParam) return;
  try {
    const shared = JSON.parse(decodeURIComponent(shareParam));
    userPlaylists.push({ name: shared.name + ' (Shared)', songs: shared.songs });
    activePlaylist = userPlaylists.at(-1);
    activePlaylistName = activePlaylist.name;
    saveAll();
    renderAll();
    alert(`Loaded shared playlist: ${activePlaylistName}`);
  } catch {
    console.error('Invalid shared playlist data');
  }
}

// --- Export/Import ---
function exportPlaylist() {
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
  } catch (e) {
    alert('Failed to export playlists.');
  }
}

function importPlaylist() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const imported = JSON.parse(text);
        if (!Array.isArray(imported)) throw 'Invalid format';
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
}

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
