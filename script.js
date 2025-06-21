// AllPlay YouTube Playlist App - Full JavaScript with Daily Recommendations

// IMPORTANT: Replace with your own YouTube Data API key
const apiKey = 'AIzaSyDHP2EWHt-9Pm4_L20lHeVt3Qotb8WYIZU';

const searchInput = document.getElementById('search');
const clearBtn = document.getElementById('clearSearch');
const inputGroup = document.getElementById('inputGroup');
const searchButton = document.getElementById('searchButton');
const loadingText = document.getElementById('loadingText');
const resultsList = document.getElementById('results');
const recommendList = document.getElementById('recommendList');
const notifyToggle = document.getElementById('notifyToggle');
const playlistItems = document.getElementById('playlistItems');
const playlistSelector = document.getElementById('activePlaylistSelector');
const sharePlaylistBtn = document.getElementById('sharePlaylistBtn');
const shareLinkInput = document.getElementById('shareLink');
const waveformVisualizer = document.getElementById('waveformVisualizer');
const recentList = document.getElementById('recentlyPlayedList');

let playlists = JSON.parse(localStorage.getItem('playlists')) || {};
let activePlaylist = localStorage.getItem('activePlaylist') || '';
let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed')) || [];
let searchHistory = JSON.parse(localStorage.getItem('searchHistory')) || [];

function toggleMobileMenu() {
  const navLinks = document.getElementById('navLinks');
  const hamburger = document.querySelector('.hamburger-menu');
  navLinks.classList.toggle('active');
  hamburger.classList.toggle('open');
}

function switchPage(pageId, linkElement) {
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');

  document.querySelectorAll('.nav-links a').forEach(link => link.classList.remove('active'));
  linkElement.classList.add('active');

  document.getElementById('navLinks').classList.remove('active');
  document.querySelector('.hamburger-menu').classList.remove('open');
}

function cycleTheme() {
  const body = document.body;
  body.setAttribute('data-theme', body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

searchInput.addEventListener('input', () => {
  clearBtn.style.display = searchInput.value ? 'block' : 'none';
  inputGroup.classList.toggle('active', searchInput.value !== '');
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearBtn.style.display = 'none';
  inputGroup.classList.remove('active');
});

searchButton.addEventListener('click', () => {
  const query = searchInput.value.trim();
  if (query) {
    searchSongs(query);
    addToSearchHistory(query);
    updateRecommendations();
  }
});

function searchSongs(query) {
  loadingText.style.display = 'block';
  resultsList.innerHTML = '';

  fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=10&key=${apiKey}`)
    .then(response => response.json())
    .then(data => {
      loadingText.style.display = 'none';
      resultsList.innerHTML = '';

      data.items.forEach(item => {
        const videoId = item.id.videoId;
        const title = item.snippet.title;
        const thumbnail = item.snippet.thumbnails.default.url;

        const li = document.createElement('li');
        li.innerHTML = `
          <div class="content-row">
            <img src="${thumbnail}" alt="${title}">
            <p>${title}</p>
          </div>
        `;

        li.addEventListener('click', () => {
          playVideo(videoId, title, thumbnail);
          addToRecentlyPlayed({ videoId, title, thumbnail });
        });

        resultsList.appendChild(li);
      });
    })
    .catch(error => {
      loadingText.style.display = 'none';
      console.error('Search failed', error);
    });
}

function playVideo(videoId, title, thumbnail) {
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  iframe.allow = 'autoplay; encrypted-media';
  iframe.allowFullscreen = true;

  const wrapper = document.createElement('div');
  wrapper.classList.add('video-wrapper');
  wrapper.appendChild(iframe);

  resultsList.innerHTML = '';
  resultsList.appendChild(wrapper);

  waveformVisualizer.style.display = 'block';
}

function addToRecentlyPlayed(video) {
  recentlyPlayed = recentlyPlayed.filter(item => item.videoId !== video.videoId);
  recentlyPlayed.unshift(video);
  if (recentlyPlayed.length > 20) recentlyPlayed.pop();
  localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
  renderRecentlyPlayed();
}

function renderRecentlyPlayed() {
  recentList.innerHTML = '';
  recentlyPlayed.forEach(video => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="content-row">
        <img src="${video.thumbnail}" alt="${video.title}">
        <p>${video.title}</p>
      </div>
    `;
    li.addEventListener('click', () => playVideo(video.videoId, video.title, video.thumbnail));
    recentList.appendChild(li);
  });
}

function clearRecentlyPlayed() {
  recentlyPlayed = [];
  localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
  renderRecentlyPlayed();
}

function createNewPlaylist() {
  const nameInput = document.getElementById('newPlaylistName');
  const name = nameInput.value.trim();
  if (!name || playlists[name]) return alert('Playlist name invalid or already exists.');

  playlists[name] = [];
  activePlaylist = name;
  nameInput.value = '';
  savePlaylists();
  renderPlaylists();
}

function savePlaylists() {
  localStorage.setItem('playlists', JSON.stringify(playlists));
  localStorage.setItem('activePlaylist', activePlaylist);
}

function renderPlaylists() {
  playlistSelector.innerHTML = '';
  Object.keys(playlists).forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if (name === activePlaylist) option.selected = true;
    playlistSelector.appendChild(option);
  });
  renderPlaylistItems();
}

function switchActivePlaylist(name) {
  activePlaylist = name;
  savePlaylists();
  renderPlaylistItems();
}

function renderPlaylistItems() {
  playlistItems.innerHTML = '';
  if (!activePlaylist || !playlists[activePlaylist]) return;

  playlists[activePlaylist].forEach((item, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="content-row">
        <img src="${item.thumbnail}" alt="${item.title}">
        <p>${item.title}</p>
        <button class="small-btn" onclick="removeFromPlaylist(${index})">Remove</button>
      </div>
    `;
    li.addEventListener('click', () => playVideo(item.videoId, item.title, item.thumbnail));
    playlistItems.appendChild(li);
  });
}

function removeFromPlaylist(index) {
  playlists[activePlaylist].splice(index, 1);
  savePlaylists();
  renderPlaylistItems();
}

function editActivePlaylistName() {
  const newName = prompt('Enter new playlist name:', activePlaylist);
  if (!newName || playlists[newName]) return;

  playlists[newName] = playlists[activePlaylist];
  delete playlists[activePlaylist];
  activePlaylist = newName;
  savePlaylists();
  renderPlaylists();
}

function deleteActivePlaylist() {
  if (confirm(`Delete playlist "${activePlaylist}"?`)) {
    delete playlists[activePlaylist];
    activePlaylist = Object.keys(playlists)[0] || '';
    savePlaylists();
    renderPlaylists();
  }
}

sharePlaylistBtn.addEventListener('click', () => {
  if (!activePlaylist) return;
  const shareData = {
    playlist: playlists[activePlaylist],
  };
  const shareUrl = `${location.origin}${location.pathname}?share=${encodeURIComponent(JSON.stringify(shareData))}`;
  shareLinkInput.value = shareUrl;
  shareLinkInput.style.display = 'block';
  shareLinkInput.select();
  document.execCommand('copy');
  alert('Share link copied to clipboard!');
});

function addToSearchHistory(query) {
  searchHistory = searchHistory.filter(item => item !== query);
  searchHistory.unshift(query);
  if (searchHistory.length > 10) searchHistory.pop();
  localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
}

function updateRecommendations() {
  recommendList.innerHTML = '';
  if (searchHistory.length === 0) return;

  const latestSearch = searchHistory[0];

  fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(latestSearch)}&type=video&maxResults=5&key=${apiKey}`)
    .then(response => response.json())
    .then(data => {
      data.items.forEach(item => {
        const videoId = item.id.videoId;
        const title = item.snippet.title;
        const thumbnail = item.snippet.thumbnails.default.url;

        const li = document.createElement('li');
        li.innerHTML = `
          <div class="content-row">
            <img src="${thumbnail}" alt="${title}">
            <p>${title}</p>
          </div>
        `;

        li.addEventListener('click', () => {
          playVideo(videoId, title, thumbnail);
          addToRecentlyPlayed({ videoId, title, thumbnail });
        });

        recommendList.appendChild(li);
      });
    });
}

// Initialize App
renderPlaylists();
renderRecentlyPlayed();
updateRecommendations();

if ('Notification' in window && Notification.permission !== 'granted') {
  notifyToggle.addEventListener('change', () => {
    Notification.requestPermission();
  });
}

if (window.location.search.includes('share=')) {
  const params = new URLSearchParams(window.location.search);
  const sharedPlaylist = JSON.parse(decodeURIComponent(params.get('share')));
  playlists['Shared Playlist'] = sharedPlaylist.playlist;
  activePlaylist = 'Shared Playlist';
  savePlaylists();
  renderPlaylists();
  switchPage('playlistPage', document.querySelector('.nav-links a:nth-child(2)'));
}
