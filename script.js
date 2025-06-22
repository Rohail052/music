// --- Config & DOM Elements ---
const apiKey = 'AIzaSyDHP2EWHt-9Pm4_L20lHeVt3Qotb8WYIZU';
const elems = {
  searchInput: document.getElementById('search'),
  clearBtn: document.getElementById('clearSearch'),
  inputGroup: document.getElementById('inputGroup'),
  resultsList: document.getElementById('results'),
  recommendList: document.getElementById('recommendList'),
  playlistItems: document.getElementById('playlistItems'),
  loadingText: document.getElementById('loadingText'),
  recentlyPlayedList: document.getElementById('recentlyPlayedList'),
  waveformVisualizer: document.getElementById('waveformVisualizer'),
  activePlaylistSelector: document.getElementById('activePlaylistSelector'),
  shareBtn: document.getElementById('sharePlaylistBtn'),
  shareLinkInput: document.getElementById('shareLink'),
  notifyToggle: document.getElementById('notifyToggle')
};

let currentVideo = null, ytPlayer = null, currentPlaylistIndex = -1;
let userPlaylists = JSON.parse(localStorage.getItem('userPlaylists')) || [{ name: 'Default Playlist', songs: [] }];
let activePlaylistName = localStorage.getItem('activePlaylistName') || userPlaylists[0].name;
let activePlaylist = userPlaylists.find(p => p.name === activePlaylistName);
let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed')) || [];
let pastSearches = JSON.parse(localStorage.getItem('pastSearches')) || [];
const MAX_RECENTLY_PLAYED = 10;
let notificationsEnabled = localStorage.getItem('notifyEnabled') === 'true';

// --- Initialization & Navigation ---
window.addEventListener('load', () => {
  elems.notifyToggle.checked = notificationsEnabled;
  elems.notifyToggle.addEventListener('change', toggleNotifications);
  elems.shareBtn.addEventListener('click', handleShare);
  elems.shareLinkInput.addEventListener('click', () => elems.shareLinkInput.select());
  setupNavigation();
  requestNotificationPermission();
  loadFromShareLink();
  renderAll();
});

// --- Helpers ---
function toggleNotifications(){
  notificationsEnabled = elems.notifyToggle.checked;
  localStorage.setItem('notifyEnabled', notificationsEnabled);
  if (notificationsEnabled) requestNotificationPermission();
}
function sendNotification(title, msg){
  if (notificationsEnabled && Notification.permission === 'granted') {
    new Notification(title, { body: msg, icon: './allplay-icon.png' });
  }
}
function requestNotificationPermission(){
  if (notificationsEnabled && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
}
function saveState(){
  localStorage.setItem('userPlaylists', JSON.stringify(userPlaylists));
  localStorage.setItem('activePlaylistName', activePlaylistName);
  localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
  localStorage.setItem('pastSearches', JSON.stringify(pastSearches));
}

// --- Navigation ---
function setupNavigation() {
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.addEventListener('click', (e) => {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-links a').forEach(x => x.classList.remove('active'));
      const target = a.getAttribute('onclick').match(/'(.+?)'/)[1];
      document.getElementById(target).classList.add('active');
      a.classList.add('active');
    });
  });
}

// --- Search & Daily Recommendations ---
elems.searchInput.addEventListener('input', () => {
  elems.clearBtn.style.display = elems.searchInput.value ? 'inline' : 'none';
  elems.inputGroup.classList.toggle('active', !!elems.searchInput.value);
});
elems.clearBtn.addEventListener('click', () => {
  elems.searchInput.value = '';
  elems.resultsList.innerHTML = '';
  elems.loadingText.style.display = 'none';
});
document.getElementById('searchButton').addEventListener('click', doSearch);
elems.searchInput.addEventListener('keypress', e => e.key === 'Enter' && doSearch());

async function doSearch(){
  const q = elems.searchInput.value.trim();
  if (!q) return alert('Enter something to search.');
  elems.loadingText.style.display = 'block';
  elems.resultsList.innerHTML = '';
  pastSearches = Array.from(new Set([q, ...pastSearches])).slice(0, 50);
  saveState();

  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&key=${apiKey}`);
    const data = await res.json();
    elems.loadingText.style.display = 'none';
    renderResults(data.items || []);
    renderRecommendations();
  } catch(e){
    elems.loadingText.style.display = 'none';
    alert('Search failed.');
  }
}

function renderResults(items){
  elems.resultsList.innerHTML = items.length
    ? items.map(it => {
      return `<li data-id="${it.id.videoId}" data-title="${it.snippet.title}">
        <div class="content-row">
          <img src="https://img.youtube.com/vi/${it.id.videoId}/default.jpg"/>
          <p>${it.snippet.title}</p>
          <button class="small-btn">Save</button>
        </div></li>`;
    }).join('')
    : '<p style="text-align:center;">No results.</p>';
  document.querySelectorAll('#results li').forEach(li => {
    const vid = li.dataset.id, title = li.dataset.title;
    li.querySelector('button').onclick = e => {
      e.stopPropagation(); saveToPlaylist(title, vid);
    };
    li.onclick = () => playVideo(vid, title);
  });
}

function renderRecommendations(){
  const recDom = pastSearches
    .sort(() => 0.5 - Math.random())
    .slice(0, 5)
    .map(q => `<li><button class="small-btn">🔍</button>${q}</li>`)
    .join('');
  elems.recommendList.innerHTML = recDom || '<li>No recommendations yet.</li>';
  document.querySelectorAll('#recommendList button').forEach(btn => {
    const q = btn.nextSibling.textContent;
    btn.onclick = () => {
      elems.searchInput.value = q;
      doSearch();
    };
  });
}

// --- Playback & Background Audio ---
function playVideo(vid, title){
  if (currentVideo) currentVideo.remove();
  ytPlayer?.destroy?.();

  const page = document.querySelector('.page.active');
  const wrapper = document.createElement('div');
  wrapper.className = 'video-wrapper';
  wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&enablejsapi=1" id="ytFrame" allow="autoplay"></iframe>`;
  page.appendChild(wrapper);
  currentVideo = wrapper;
  addRecentlyPlayed(title, vid);
  elems.waveformVisualizer.style.display = 'block';

  if (window.YT?.Player) {
    ytPlayer = new YT.Player('ytFrame', { events: { 'onStateChange': onYTStateChange } });
  }
}

function onYTStateChange({data}){
  if (data === YT.PlayerState.ENDED) elems.waveformVisualizer.style.display = 'none';
}

// --- Playlists Management ---
function saveToPlaylist(title, vid){
  if (activePlaylist.songs.some(s => s.videoId === vid)) return alert('Already in playlist.');
  activePlaylist.songs.push({title, videoId: vid});
  saveState();
  sendNotification('Added 🎵', title);
  renderPlaylist();
}

function renderPlaylist(){
  elems.playlistItems.innerHTML = activePlaylist.songs.length
    ? activePlaylist.songs.map((s,i)=>`
      <li data-idx="${i}" data-id="${s.videoId}" data-title="${s.title}">
        <div class="content-row">
          <img src="https://img.youtube.com/vi/${s.videoId}/default.jpg"/>
          <p>${s.title}</p>
          <button class="small-btn">Remove</button>
        </div>
      </li>`).join('')
    : '<p style="text-align:center;">Playlist is empty.</p>';

  document.querySelectorAll('#playlistItems li').forEach(li => {
    const idx = +li.dataset.idx, vid = li.dataset.id, title = li.dataset.title;
    li.querySelector('button').onclick = e => {
      e.stopPropagation();
      activePlaylist.songs.splice(idx,1);
      saveState(); renderPlaylist();
    };
    li.onclick = () => playVideo(vid, title);
  });
}

// --- Recently Played Page ---
function addRecentlyPlayed(title, vid){
  recentlyPlayed = recentlyPlayed.filter(r => r.videoId !== vid);
  recentlyPlayed.unshift({title, videoId: vid});
  if (recentlyPlayed.length > MAX_RECENTLY_PLAYED) recentlyPlayed.pop();
  saveState(); renderRecently();
}
function renderRecently(){
  elems.recentlyPlayedList.innerHTML = recentlyPlayed.length
    ? recentlyPlayed.map(r=>`
      <li data-id="${r.videoId}" data-title="${r.title}">
        <div class="content-row">
          <img src="https://img.youtube.com/vi/${r.videoId}/default.jpg"/>
          <p>${r.title}</p>
          <button class="small-btn">Play</button>
        </div>
      </li>`).join('')
    : '<p style="text-align:center;">None yet.</p>';

  document.querySelectorAll('#recentlyPlayedList li').forEach(li=>{
    const vid=li.dataset.id, title=li.dataset.title;
    li.querySelector('button').onclick = e => {
      e.stopPropagation(); playVideo(vid, title);
    };
  });
}
function clearRecently(){
  if (!confirm('Clear recent?')) return;
  recentlyPlayed = []; saveState(); renderRecently();
  sendNotification('Cleared', 'Recently-played cleared.');
}

// --- Share Playlist ---
function handleShare(){
  const payload = encodeURIComponent(JSON.stringify({name: activePlaylistName, songs: activePlaylist.songs}));
  const link = `${location.origin + location.pathname}?share=${payload}`;
  elems.shareLinkInput.value = link;
  elems.shareLinkInput.style.display = 'block';
  elems.shareLinkInput.select();
  document.execCommand('copy');
  sendNotification('Copied!', 'Playlist share link copied to clipboard.');
}
function loadFromShareLink(){
  const p = new URLSearchParams(location.search).get('share');
  if (!p) return;
  try {
    const obj = JSON.parse(decodeURIComponent(p));
    userPlaylists.push({name: obj.name+' (Shared)', songs: obj.songs});
    activePlaylistName = userPlaylists.at(-1).name;
    activePlaylist = userPlaylists.at(-1);
    saveState();
    renderPlaylist();
    alert(`Loaded shared: ${activePlaylistName}`);
  } catch(e){console.error(e);}
}

// --- Common Render at Start ---
function renderAll(){
  elems.activePlaylistSelector.innerHTML = userPlaylists.map(pl => `<option>${pl.name}</option>`).join('');
  elems.activePlaylistSelector.value = activePlaylistName;
  renderPlaylist(); renderRecommendations(); renderRecently();
}
elems.activePlaylistSelector.addEventListener('change', e => {
  activePlaylistName = e.target.value;
  activePlaylist = userPlaylists.find(pl => pl.name === activePlaylistName);
  saveState(); renderPlaylist();
});
