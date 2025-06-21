    const apiKey = 'AIzaSyDHP2EWHt-9Pm4_L20lHeVt3Qotb8WYIZU';
    const searchInput = document.getElementById('search');
    const clearBtn = document.getElementById('clearSearch');
    const inputGroup = document.getElementById('inputGroup');
    const resultsList = document.getElementById('results');
    const playlistItems = document.getElementById('playlistItems');
    const loadingText = document.getElementById('loadingText');
    const recentlyPlayedList = document.getElementById('recentlyPlayedList');
    const waveformVisualizer = document.getElementById('waveformVisualizer');
    const activePlaylistSelector = document.getElementById('activePlaylistSelector');
    const navLinks = document.getElementById('navLinks');
    const hamburgerMenu = document.querySelector('.hamburger-menu');


    let currentVideo = null;
    let ytPlayer = null;
    let currentPlaylistIndex = -1;

    // --- Data Storage ---
    // Structure for multiple playlists
    let userPlaylists = JSON.parse(localStorage.getItem('userPlaylists')) || [{ name: 'Default Playlist', songs: [] }];
    let activePlaylistName = localStorage.getItem('activePlaylistName') || userPlaylists[0].name;
    let activePlaylist = userPlaylists.find(pl => pl.name === activePlaylistName) || userPlaylists[0];

    let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed')) || [];

    const MAX_RECENTLY_PLAYED = 10;

    // --- Theme Cycle (existing) ---
    function cycleTheme() {
      const current = document.body.getAttribute("data-theme");
      const hour = new Date().getHours();
      const next = current === "light" ? "dark" : current === "dark" ? "auto" : (hour < 7 || hour >= 19 ? "dark" : "light");
      document.body.setAttribute("data-theme", next === "auto" ? (hour < 7 || hour >= 19 ? "dark" : "light") : next);
    }

    // --- Responsive Navigation ---
    function toggleMobileMenu() {
        navLinks.classList.toggle('active');
        hamburgerMenu.classList.toggle('open');
    }

    // Close mobile menu when a link is clicked
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            if (navLinks.classList.contains('active')) {
                toggleMobileMenu();
            }
        });
    });


    // --- Smooth Page Transitions (updated) ---
    let currentPageId = 'homePage'; // Track the currently active page ID

    function switchPage(newId, el) {
      const oldPage = document.getElementById(currentPageId);
      const newPage = document.getElementById(newId);

      if (oldPage) {
        oldPage.classList.remove('active');
      }

      if (newPage) {
        newPage.classList.add('active');
      }

      document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
      if (el) {
        el.classList.add('active');
      }
      currentPageId = newId; // Update current page ID

      // Refresh content for specific pages when switched to
      if (newId === 'playlistPage') {
          updatePlaylistSelector();
          updatePlaylist();
      } else if (newId === 'recentlyPlayedPage') {
          updateRecentlyPlayed();
      }
    }

    // Initialize the first page
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById(currentPageId).classList.add('active');
        updatePlaylistSelector(); // Populate playlist selector on load
        updatePlaylist(); // Show current active playlist
        requestNotificationPermission(); // Request notification permission
    });


    // --- Search Input Logic (existing) ---
    searchInput.addEventListener('input', () => {
      clearBtn.style.display = searchInput.value ? 'inline' : 'none';
      inputGroup.classList.toggle('active', !!searchInput.value);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      resultsList.innerHTML = '';
      loadingText.style.display = 'none';
      clearBtn.style.display = 'none';
      inputGroup.classList.remove('active');
    });

    document.getElementById('searchButton').addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleSearch(); });

    // --- Search Functionality ---
    function handleSearch() {
      const query = searchInput.value.trim();
      if (!query) return alert('Please enter a search term!');

      resultsList.innerHTML = '';
      loadingText.style.display = 'block';
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&key=${apiKey}`;
      fetch(url)
        .then(res => res.json())
        .then(data => {
          loadingText.style.display = 'none';
          displayResults(data.items);
        })
        .catch(err => {
          loadingText.style.display = 'none';
          console.error('Error:', err);
          alert('Failed to fetch search results. Check your API key or network.');
        });
    }

    function displayResults(items) {
      resultsList.innerHTML = '';
      if (items.length === 0) {
          resultsList.innerHTML = '<p style="text-align:center;">No results found.</p>';
          return;
      }
      items.forEach(item => {
        const li = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'content-row';
        row.innerHTML = `
          <img src="http://img.youtube.com/vi/${item.id.videoId}/default.jpg" alt="${item.snippet.title}" />
          <p>${item.snippet.title}</p>
          <button class="small-btn">Save to Playlist</button>
        `;
        row.querySelector('button').onclick = e => {
          e.stopPropagation();
          saveToActivePlaylist(item.snippet.title, item.id.videoId);
        };
        li.appendChild(row);
        li.onclick = () => playVideoInline(li, item.id.videoId, item.snippet.title);
        resultsList.appendChild(li);
      });
    }

    // --- Video Playback (updated for recently played & visualizer) ---
    function playVideoInline(container, videoId, title) {
      if (currentVideo) currentVideo.remove();
      if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy(); // Ensure old player is destroyed

      const wrapper = document.createElement('div');
      wrapper.className = 'video-wrapper';
      wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1" allow="autoplay; encrypted-media" allowfullscreen id="ytPlayerEmbed"></iframe>`;
      container.appendChild(wrapper);
      currentVideo = wrapper;

      addRecentlyPlayed(title, videoId); // Add to recently played

      // Show waveform visualizer
      waveformVisualizer.style.display = 'block';

      // Initialize YouTube Player
      if (window.YT && window.YT.Player) {
          ytPlayer = new YT.Player('ytPlayerEmbed', {
              events: {
                  'onStateChange': onPlayerStateChange
              }
          });
      } else {
          console.warn("YouTube Iframe API not ready yet. Video playback might not fully support events.");
      }
    }

    function onPlayerStateChange(event) {
        // Hide visualizer when video ends or is paused
        if (event.data === YT.PlayerState.ENDED || event.data === YT.PlayerState.PAUSED) {
            waveformVisualizer.style.display = 'none';
        } else if (event.data === YT.PlayerState.PLAYING) {
            waveformVisualizer.style.display = 'block';
        }

        if (event.data === YT.PlayerState.ENDED) {
            sendNotification('Song Ended', `"${activePlaylist.songs[currentPlaylistIndex].title}" has finished.`);
            const next = currentPlaylistIndex + 1;
            if (next < activePlaylist.songs.length) {
                currentPlaylistIndex = next;
                const nextLi = playlistItems.children[next];
                playPlaylistVideo(nextLi, activePlaylist.songs[next].videoId, activePlaylist.songs[next].title);
            } else {
                // End of playlist
                waveformVisualizer.style.display = 'none';
                sendNotification('Playlist Ended', `"${activePlaylist.name}" has finished.`);
            }
        }
    }


    // --- Multiple Playlists Logic ---
    function saveUserPlaylists() {
        localStorage.setItem('userPlaylists', JSON.stringify(userPlaylists));
        localStorage.setItem('activePlaylistName', activePlaylistName);
    }

    function updatePlaylistSelector() {
        activePlaylistSelector.innerHTML = '';
        if (userPlaylists.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No Playlists';
            activePlaylistSelector.appendChild(option);
            return;
        }

        userPlaylists.forEach(pl => {
            const option = document.createElement('option');
            option.value = pl.name;
            option.textContent = pl.name;
            activePlaylistSelector.appendChild(option);
        });
        activePlaylistSelector.value = activePlaylistName;
    }

    function switchActivePlaylist(name) {
        if (!name) return; // Prevent switching to empty name if no playlists
        activePlaylistName = name;
        activePlaylist = userPlaylists.find(pl => pl.name === activePlaylistName) || userPlaylists[0];
        saveUserPlaylists();
        updatePlaylist(); // Reload playlist items for the new active playlist
    }

    function createNewPlaylist() {
        const newNameInput = document.getElementById('newPlaylistName');
        const newName = newNameInput.value.trim();
        if (!newName) return alert('Please enter a name for the new playlist.');
        if (userPlaylists.some(pl => pl.name === newName)) return alert('A playlist with this name already exists.');

        userPlaylists.push({ name: newName, songs: [] });
        newNameInput.value = ''; // Clear input
        saveUserPlaylists();
        updatePlaylistSelector();
        switchActivePlaylist(newName); // Make the new playlist active
        sendNotification('Playlist Created', `Playlist "${newName}" has been created.`);
    }

    function editActivePlaylistName() {
        if (userPlaylists.length === 0) return alert('No playlists to edit.');
        const newName = prompt(`Enter new name for "${activePlaylistName}":`);
        if (!newName || newName.trim() === '' || newName === activePlaylistName) return;
        if (userPlaylists.some(pl => pl.name === newName.trim())) return alert('A playlist with this name already exists.');

        const index = userPlaylists.findIndex(pl => pl.name === activePlaylistName);
        if (index !== -1) {
            userPlaylists[index].name = newName.trim();
            activePlaylistName = newName.trim(); // Update active name
            saveUserPlaylists();
            updatePlaylistSelector();
            alert(`Playlist renamed to "${activePlaylistName}".`);
        }
    }

    function deleteActivePlaylist() {
        if (userPlaylists.length === 0) return alert('No playlists to delete.');
        if (userPlaylists.length === 1 && userPlaylists[0].name === activePlaylistName) {
             return alert('Cannot delete the last playlist. Create another playlist first to delete this one.');
        }
        if (!confirm(`Are you sure you want to delete the playlist "${activePlaylistName}"? This action cannot be undone.`)) return;

        userPlaylists = userPlaylists.filter(pl => pl.name !== activePlaylistName);
        activePlaylistName = userPlaylists.length > 0 ? userPlaylists[0].name : ''; // Set first playlist as active, or empty if none
        activePlaylist = userPlaylists.length > 0 ? userPlaylists[0] : { name: '', songs: [] };
        saveUserPlaylists();
        updatePlaylistSelector();
        updatePlaylist();
        alert(`Playlist "${activePlaylistName}" deleted.`);
        sendNotification('Playlist Deleted', `Playlist "${activePlaylistName}" has been deleted.`);
    }

    // --- Playlist Saving/Updating (adapted for multiple playlists) ---
    function saveToActivePlaylist(title, videoId) {
      if (userPlaylists.length === 0) {
        alert('Please create a playlist first before saving songs.');
        return;
      }
      if (activePlaylist.songs.find(song => song.videoId === videoId)) {
        sendNotification('Duplicate Song', '🎵 Song already in this playlist!');
        return;
      }
      activePlaylist.songs.push({ title, videoId });
      saveUserPlaylists();
      updatePlaylist();
      sendNotification('Song Added', `"${title}" added to "${activePlaylistName}".`);
    }

    function updatePlaylist() {
      playlistItems.innerHTML = '';
      if (!activePlaylist || activePlaylist.songs.length === 0) {
          playlistItems.innerHTML = '<p style="text-align:center;">This playlist is empty. Add some songs!</p>';
          return;
      }
      activePlaylist.songs.forEach((song, index) => {
        const li = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'content-row';
        row.innerHTML = `
          <img src="http://img.youtube.com/vi/${song.videoId}/default.jpg" alt="${song.title}" />
          <p>${song.title}</p>
          <button class="small-btn">Remove</button>
        `;
        row.querySelector('button').onclick = e => {
          e.stopPropagation();
          removeFromPlaylist(song.videoId);
        };
        li.appendChild(row);
        li.onclick = () => {
          currentPlaylistIndex = index;
          playPlaylistVideo(li, song.videoId, song.title);
        };
        playlistItems.appendChild(li);
      });
    }

    function removeFromPlaylist(videoId) {
      activePlaylist.songs = activePlaylist.songs.filter(song => song.videoId !== videoId);
      saveUserPlaylists();
      updatePlaylist();
      sendNotification('Song Removed', 'Song removed from playlist.');
    }

    function playPlaylistVideo(container, videoId, title) {
      // Re-use playVideoInline for consistent playback logic
      playVideoInline(container, videoId, title);
    }

    // --- Recently Played ---
    function addRecentlyPlayed(title, videoId) {
        // Remove if already in recently played to move it to the top
        recentlyPlayed = recentlyPlayed.filter(item => item.videoId !== videoId);
        recentlyPlayed.unshift({ title, videoId, timestamp: Date.now() }); // Add to beginning
        if (recentlyPlayed.length > MAX_RECENTLY_PLAYED) {
            recentlyPlayed = recentlyPlayed.slice(0, MAX_RECENTLY_PLAYED); // Trim
        }
        localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
        updateRecentlyPlayed();
    }

    function updateRecentlyPlayed() {
        recentlyPlayedList.innerHTML = '';
        if (recentlyPlayed.length === 0) {
            recentlyPlayedList.innerHTML = '<p style="text-align:center;">No recently played songs.</p>';
            return;
        }
        recentlyPlayed.forEach(song => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="content-row">
                    <img src="http://img.youtube.com/vi/${song.videoId}/default.jpg" alt="${song.title}" />
                    <p>${song.title}</p>
                    <button class="small-btn">Play</button>
                </div>
            `;
            li.querySelector('button').onclick = e => {
                e.stopPropagation();
                // To play from recently played, we switch to playlist page and display the video there.
                // This might mean the user has to scroll to see it if it's not immediately visible.
                switchPage('playlistPage', document.querySelector('.nav-links a[onclick*="playlistPage"]'));
                playVideoInline(document.getElementById('playlistPage'), song.videoId, song.title); // Attach to playlist page
            };
            recentlyPlayedList.appendChild(li);
        });
    }

    function clearRecentlyPlayed() {
        if (confirm('Are you sure you want to clear your recently played list?')) {
            recentlyPlayed = [];
            localStorage.removeItem('recentlyPlayed');
            updateRecentlyPlayed();
            sendNotification('Recent Cleared', 'Recently played list has been cleared.');
        }
    }

    // --- Notifications ---
    function requestNotificationPermission() {
        if (!("Notification" in window)) {
            console.warn("This browser does not support desktop notification");
            return;
        }
        if (Notification.permission !== "granted") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    console.log("Notification permission granted.");
                } else {
                    console.warn("Notification permission denied.");
                }
            });
        }
    }

    function sendNotification(title, message) {
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification(title, {
                body: message,
                icon: './allplay-icon.png' // Use relative path for notification icon
            });
        }
    }

    // --- YouTube Iframe API Ready ---
    function onYouTubeIframeAPIReady() {
        console.log("YouTube Iframe API is ready.");
    }

    // --- Service Worker Registration ---
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js') // Crucial: use relative path
          .then(registration => {
            console.log('Service Worker registered successfully:', registration);
          })
          .catch(error => {
            console.error('Service Worker registration failed:', error);
          });
      });
    }

    // Initial load calls
    updatePlaylistSelector();
    updatePlaylist();
    updateRecentlyPlayed();
    requestNotificationPermission();
