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
};

// --- State ---
let userPlaylists = JSON.parse(localStorage.getItem('userPlaylists')) || [{ name: 'Default Playlist', songs: [] }];
let activePlaylistName = localStorage.getItem('activePlaylistName') || userPlaylists[0].name;
let activePlaylist = userPlaylists.find(p => p.name === activePlaylistName);
let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed')) || [];
const MAX_RECENT = 10;

let currentVideoWrapper = null;

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

  setupNavigation();

  // On load: if no playlists found, prompt import backup
  if (!localStorage.getItem('userPlaylists')) {
    setTimeout(() => {
      if (confirm('No playlists found. Would you like to import a backup from iCloud or Files?')) {
        importPlaylist();
      }
    }, 500);
  }

  loadSharedPlaylist();
  renderAll();
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
function toggleMobileMenu() {
  elems.navLinks.classList.toggle('active');
  elems.hamburgerMenu.classList.toggle('open');
}

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

// --- YouTube Search ---
async function doSearch() {
  const q = elems.searchInput.value.trim();
  if (!q) return alert('Enter something to search.');
  elems.resultsList.innerHTML = '<li>Searching…</li>';

  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(q)}&key=${apiKey}`);
    const data = await res.json();
    renderResults(data.items || []);
  } catch {
    elems.resultsList.innerHTML = '<li>Error fetching results.</li>';
  }
}

function renderResults(items) {
  elems.resultsList.innerHTML = items.length
    ? items.map(it => `
      <li data-id="${it.id.videoId}" data-title="${it.snippet.title}">
        <div class="content-row">
          <img src="https://img.youtube.com/vi/${it.id.videoId}/default.jpg" alt="thumb"/>
          <p>${it.snippet.title}</p>
          <button class="small-btn">Save</button>
        </div>
      </li>`).join('')
    : '<p>No results.</p>';

  elems.resultsList.querySelectorAll('li').forEach(li => {
    const vid = li.dataset.id, title = li.dataset.title;
    li.querySelector('button').onclick = e => { e.stopPropagation(); saveToPlaylist(title, vid); };
    li.onclick = () => playInlineBelow(li, vid, title);
  });
}

// --- Play video iframe inline below clicked item ---
function playInlineBelow(itemEl, vid, title) {
  // Remove any existing video wrapper
  if (currentVideoWrapper) currentVideoWrapper.remove();

  // Create video iframe wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'video-wrapper';
  wrapper.innerHTML = `<iframe 
    src="https://www.youtube.com/embed/${vid}?autoplay=1&enablejsapi=1&rel=0"
    allow="autoplay"
    allowfullscreen
    style="width:100%; height:180px; margin-top:10px; border:none;">
    </iframe>`;

  // Insert directly after the clicked item
  itemEl.after(wrapper);
  currentVideoWrapper = wrapper;

  addRecentlyPlayed(title, vid);
  notify('Playing 🎶', title);
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
      <li data-idx="${i}" data-id="${s.videoId}" data-title="${s.title}">
        <div class="content-row">
          <img src="https://img.youtube.com/vi/${s.videoId}/default.jpg" alt="thumb"/>
          <p>${s.title}</p>
          <button class="small-btn">Remove</button>
        </div>
      </li>`).join('')
    : '<p>Empty playlist.</p>';

  elems.playlistItems.querySelectorAll('li').forEach(li => {
    const vid = li.dataset.id, title = li.dataset.title, idx = +li.dataset.idx;
    li.querySelector('button').onclick = e => {
      e.stopPropagation();
      activePlaylist.songs.splice(idx, 1);
      saveAll();
      renderPlaylist();
    };
    li.onclick = () => playInlineBelow(li, vid, title);
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
      <li data-id="${r.videoId}" data-title="${r.title}">
        <div class="content-row">
          <img src="https://img.youtube.com/vi/${r.videoId}/default.jpg" alt="thumb"/>
          <p>${r.title}</p>
          <button class="small-btn">Play</button>
        </div>
      </li>`).join('')
    : '<p>No recently played yet.</p>';

  elems.recentlyPlayedList.querySelectorAll('li').forEach(li => {
    const vid = li.dataset.id, title = li.dataset.title;
    li.querySelector('button').onclick = e => { e.stopPropagation(); playInlineBelow(li, vid, title); };
    li.onclick = () => playInlineBelow(li, vid, title);
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
  const name = document.getElementById('newPlaylistName').value.trim();
  if (!name) return alert('Enter playlist name.');
  if (userPlaylists.some(p => p.name === name)) return alert('Playlist already exists.');
  userPlaylists.push({ name, songs: [] });
  activePlaylistName = name;
  activePlaylist = userPlaylists.at(-1);
  saveAll();
  renderAll();
  document.getElementById('newPlaylistName').value = '';
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

// --- Export/Import for iCloud backup ---

// Export playlists to file (for iCloud Files app backup)
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
    notify('Exported', 'Playlists exported for iCloud backup');
  } catch (e) {
    alert('Failed to export playlists.');
  }
}

// Import playlists from file (for restore from iCloud Files app)
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
  elems.activePlaylistSelector.innerHTML = userPlaylists.map(p => `<option>${p.name}</option>`).join('');
  elems.activePlaylistSelector.value = activePlaylistName;
  renderPlaylist();
  renderRecentlyPlayed();
}
