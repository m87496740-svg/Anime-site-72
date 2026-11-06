// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBYqQXQsW-zHFzoNQ5CqUvxUcKw0iXdJ20",
  authDomain: "anime-portal-tamil-3486b.firebaseapp.com",
  projectId: "anime-portal-tamil-3486b",
  storageBucket: "anime-portal-tamil-3486b.firebasestorage.app",
  messagingSenderId: "1048898637000",
  appId: "1:1048898637000:web:14fcc1776242f1401429fd"
};

// Initialize Firebase & Cloud Firestore
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Master Owner Password
const OWNER_PASSWORD = "Kettavan77";

let currentActiveStream = "";
let currentAnimeId = null;
let currentEpIndex = 0;
let animeDatabase = [];
let resumeTimestamp = 0;

// Realtime Cloud Fetch from Firestore
function initRealtimeSync() {
  db.collection("animes").onSnapshot((snapshot) => {
    animeDatabase = [];
    snapshot.forEach((doc) => {
      animeDatabase.push({ id: doc.id, ...doc.data() });
    });

    renderAnimeGrid(animeDatabase);
    populateAnimeDropdown();
    renderManageList();
    checkContinueWatching();
  }, (error) => {
    console.error("Firestore sync error:", error);
  });
}

// Render Anime Cards Grid
function renderAnimeGrid(list) {
  const grid = document.getElementById('animeGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!list || list.length === 0) {
    grid.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 20px; text-align: center; grid-column: span 2;">No anime found. Add anime using the shield icon!</p>';
    return;
  }

  list.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.innerHTML = `
      <div class="poster-wrap">
        <span class="badge-tamil">TAMIL</span>
        <img src="${item.poster || 'https://via.placeholder.com/300x450/12151e/00f2fe?text=Poster'}" alt="${item.title}" loading="lazy">
      </div>
      <div class="card-meta">
        <h3>${item.title}</h3>
        <span class="genre-tag">${item.genre || 'Anime'}</span>
      </div>
    `;
    card.onclick = () => activatePlayer(item.id);
    grid.appendChild(card);
  });
}

// Activate Player with Next / Prev Sync
function activatePlayer(animeId, targetEpIndex = null) {
  const item = animeDatabase.find(a => a.id === animeId);
  if (!item) return;

  currentAnimeId = animeId;
  currentEpIndex = (targetEpIndex !== null) ? targetEpIndex : 0;

  const playerBox = document.getElementById('playerBox');
  document.getElementById('currentAnimeTitle').innerText = item.title;
  const chips = document.getElementById('epChipsContainer');

  playerBox.style.display = 'block';
  chips.innerHTML = '';

  item.episodes.forEach((ep, idx) => {
    const chip = document.createElement('div');
    chip.className = `ep-chip ${idx === currentEpIndex ? 'active' : ''}`;
    chip.id = `chip-ep-${idx}`;
    chip.innerText = `EP ${ep.ep}`;
    chip.onclick = () => {
      currentEpIndex = idx;
      resumeTimestamp = 0;
      updatePlayerUI(item);
    };
    chips.appendChild(chip);
  });

  if (item.episodes.length > 0) {
    updatePlayerUI(item);
  }
  playerBox.scrollIntoView({ behavior: 'smooth' });
}

// Update Active Episode & Quick Buttons
function updatePlayerUI(item) {
  document.querySelectorAll('.ep-chip').forEach(c => c.classList.remove('active'));
  const activeChip = document.getElementById(`chip-ep-${currentEpIndex}`);
  if (activeChip) activeChip.classList.add('active');

  const prevBtn = document.getElementById('prevEpBtn');
  const nextBtn = document.getElementById('nextEpBtn');
  if (prevBtn) prevBtn.disabled = (currentEpIndex === 0);
  if (nextBtn) nextBtn.disabled = (currentEpIndex === item.episodes.length - 1);

  mountStream(item.episodes[currentEpIndex]);
}

// Next / Previous Episode Switch
function changeEpisode(direction) {
  const item = animeDatabase.find(a => a.id === currentAnimeId);
  if (!item || !item.episodes || item.episodes.length <= 1) return;

  const nextIdx = currentEpIndex + direction;
  if (nextIdx >= 0 && nextIdx < item.episodes.length) {
    currentEpIndex = nextIdx;
    resumeTimestamp = 0;
    updatePlayerUI(item);
  }
}

// Native Video Controls Player with Resume & Progress Tracking
function mountStream(ep) {
  const currentEpTitle = document.getElementById('currentEpTitle');
  if (currentEpTitle) {
    currentEpTitle.innerText = `${ep.title} • Now Streaming`;
  }

  const mediaHost = document.getElementById('mediaHost');
  if (!mediaHost) return;
  mediaHost.innerHTML = '';

  let streamUrl = ep.stream_url ? ep.stream_url.trim() : '';

  if (!streamUrl) {
    mediaHost.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.85rem;padding:20px;">Stream link missing!</div>';
    return;
  }

  let directVideoUrl = streamUrl;
  if (directVideoUrl.includes('/watch/')) {
    directVideoUrl = directVideoUrl.replace('/watch/', '/');
  }

  const video = document.createElement('video');
  video.id = 'directVideo';
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('webkit-playsinline', 'true');
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.background = '#000';
  video.src = directVideoUrl;

  // Auto-resume playback position
  video.onloadedmetadata = () => {
    if (resumeTimestamp > 0) {
      video.currentTime = resumeTimestamp;
      resumeTimestamp = 0;
    }
  };

  // Auto-save watch progress
  video.ontimeupdate = () => {
    if (video.currentTime > 5 && (video.duration - video.currentTime > 5)) {
      saveProgress(currentAnimeId, currentEpIndex, video.currentTime, video.duration);
    }
  };

  // Video complete aana history reset
  video.onended = () => {
    localStorage.removeItem('portal_continue_watching');
    checkContinueWatching();
  };

  video.onerror = () => {
    mediaHost.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.src = streamUrl;
    frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = 'none';
    mediaHost.appendChild(frame);
  };

  mediaHost.appendChild(video);
}

// Browser True Fullscreen + Cinema Mode
function toggleFullScreen() {
  const playerBox = document.getElementById('playerBox');
  const doc = document.documentElement;

  if (playerBox) {
    playerBox.classList.toggle('cinema-mode');
  }

  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (doc.requestFullscreen) {
      doc.requestFullscreen().catch(() => {});
    } else if (doc.webkitRequestFullscreen) {
      doc.webkitRequestFullscreen().catch(() => {});
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen().catch(() => {});
    }
  }
}

// Live Search
function handleSearch() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  const filtered = animeDatabase.filter(a => 
    a.title.toLowerCase().includes(query) || (a.genre && a.genre.toLowerCase().includes(query))
  );
  renderAnimeGrid(filtered);
}

// Continue Watching State Management
function saveProgress(animeId, epIdx, time, duration) {
  const item = animeDatabase.find(a => a.id === animeId);
  if (!item || !item.episodes[epIdx]) return;

  const data = {
    animeId: animeId,
    title: item.title,
    poster: item.poster,
    epIdx: epIdx,
    epNum: item.episodes[epIdx].ep,
    currentTime: time,
    duration: duration,
    percent: Math.min(100, Math.floor((time / duration) * 100))
  };

  localStorage.setItem('portal_continue_watching', JSON.stringify(data));
  checkContinueWatching();
}

function checkContinueWatching() {
  const box = document.getElementById('continueWatchingBox');
  const card = document.getElementById('continueCard');
  if (!box || !card) return;

  const saved = localStorage.getItem('portal_continue_watching');
  if (!saved) {
    box.style.display = 'none';
    return;
  }

  const data = JSON.parse(saved);
  box.style.display = 'block';

  card.innerHTML = `
    <img src="${data.poster || 'https://via.placeholder.com/300x450/12151e/00f2fe?text=Poster'}" class="continue-thumb" alt="${data.title}">
    <div class="continue-info">
      <h4>${data.title}</h4>
      <span>Episode ${data.epNum} • ${data.percent}% Completed</span>
    </div>
    <div class="continue-progress-bar" style="width: ${data.percent}%;"></div>
  `;

  card.onclick = () => {
    resumeTimestamp = data.currentTime;
    activatePlayer(data.animeId, data.epIdx);
  };
}

function clearWatchHistory() {
  localStorage.removeItem('portal_continue_watching');
  checkContinueWatching();
}

// Owner Security Modals
function openAuthModal() {
  document.getElementById('authPassword').value = '';
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authModal').style.display = 'flex';
}

function verifyOwner() {
  const val = document.getElementById('authPassword').value.trim();
  if (val === OWNER_PASSWORD) {
    document.getElementById('authModal').style.display = 'none';
    populateAnimeDropdown();
    renderManageList();
    document.getElementById('masterModal').style.display = 'flex';
  } else {
    document.getElementById('authError').style.display = 'block';
  }
}

function closeAllModals() {
  document.getElementById('authModal').style.display = 'none';
  document.getElementById('masterModal').style.display = 'none';
}

// Populate Dropdown with Existing Anime
function populateAnimeDropdown() {
  const dropdown = document.getElementById('animeSelectDropdown');
  if (!dropdown) return;

  dropdown.innerHTML = '<option value="NEW">+ Add New Anime</option>';
  animeDatabase.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.innerText = `${item.title} (${item.episodes.length} Eps)`;
    dropdown.appendChild(opt);
  });
  handleAnimeDropdownChange();
}

function handleAnimeDropdownChange() {
  const dropdown = document.getElementById('animeSelectDropdown');
  const selected = dropdown.value;
  const titleGroup = document.getElementById('titleInputGroup');
  const posterGroup = document.getElementById('posterInputGroup');
  const genreGroup = document.getElementById('genreInputGroup');
  const epNumInput = document.getElementById('upEpNum');

  if (selected === 'NEW') {
    titleGroup.style.display = 'block';
    posterGroup.style.display = 'block';
    genreGroup.style.display = 'block';
    document.getElementById('upTitle').value = '';
    document.getElementById('upPoster').value = '';
    document.getElementById('upGenre').value = '';
    epNumInput.value = '1';
  } else {
    const item = animeDatabase.find(a => a.id === selected);
    if (item) {
      titleGroup.style.display = 'none';
      posterGroup.style.display = 'none';
      genreGroup.style.display = 'none';
      epNumInput.value = item.episodes.length + 1;
    }
  }
}

// Manage List
function renderManageList() {
  const listContainer = document.getElementById('manageList');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  if (animeDatabase.length === 0) {
    listContainer.innerHTML = '<p style="font-size: 0.75rem; color: var(--text-muted);">No anime available in Cloud.</p>';
    return;
  }

  animeDatabase.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'manage-item';
    row.innerHTML = `
      <span>${item.title} (${item.episodes.length} eps)</span>
      <button class="btn-delete" onclick="removeAnime('${item.id}')">Delete</button>
    `;
    listContainer.appendChild(row);
  });
}

// Delete Anime from Firestore
async function removeAnime(animeId) {
  if (!confirm("Delete this anime from Cloud Database?")) return;

  try {
    await db.collection("animes").doc(animeId).delete();
    const playerBox = document.getElementById('playerBox');
    if (playerBox) playerBox.style.display = 'none';
    const mediaHost = document.getElementById('mediaHost');
    if (mediaHost) mediaHost.innerHTML = '';
  } catch (error) {
    alert("Delete error: " + error.message);
  }
}

// Add or Update Content in Firestore
async function submitNewContent() {
  const dropdown = document.getElementById('animeSelectDropdown');
  const selectedAnimeId = dropdown.value;
  const epNum = parseInt(document.getElementById('upEpNum').value) || 1;
  const streamUrl = document.getElementById('upStreamUrl').value.trim();

  if (!streamUrl) {
    alert("Stream URL is required!");
    return;
  }

  try {
    if (selectedAnimeId === 'NEW') {
      const title = document.getElementById('upTitle').value.trim();
      const poster = document.getElementById('upPoster').value.trim() || 'https://via.placeholder.com/300x450/12151e/00f2fe?text=' + encodeURIComponent(title);
      const genre = document.getElementById('upGenre').value.trim() || 'Tamil Dubbed';

      if (!title) {
        alert("Anime Title is required for new entry!");
        return;
      }

      await db.collection("animes").add({
        title: title,
        poster: poster,
        genre: genre,
        episodes: [{ ep: epNum, title: `Episode ${epNum}`, stream_url: streamUrl }]
      });

    } else {
      let item = animeDatabase.find(a => a.id === selectedAnimeId);
      if (!item) return;

      let updatedEpisodes = [...item.episodes];
      const epIdx = updatedEpisodes.findIndex(e => e.ep === epNum);

      if (epIdx > -1) {
        updatedEpisodes[epIdx].stream_url = streamUrl;
      } else {
        updatedEpisodes.push({ ep: epNum, title: `Episode ${epNum}`, stream_url: streamUrl });
        updatedEpisodes.sort((a, b) => a.ep - b.ep);
      }

      await db.collection("animes").doc(selectedAnimeId).update({
        episodes: updatedEpisodes
      });
    }

    closeAllModals();
    document.getElementById('upStreamUrl').value = '';
    alert(`Episode ${epNum} successfully saved to Cloud!`);
  } catch (error) {
    alert("Cloud save failed: " + error.message);
  }
}

// Boot Realtime Cloud Listener & Initial State Check
initRealtimeSync();
checkContinueWatching();
