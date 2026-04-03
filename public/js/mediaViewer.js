// ====================================
// WinNAS - Media Viewer (Audio Leak Fixed)
// ====================================

var mediaItems = [];
var currentMediaIndex = -1;

// Thoroughly destroy any video/audio elements to prevent audio leak
function destroyMediaElements(container) {
  if (!container) return;

  // Find ALL video and audio elements
  var videos = container.querySelectorAll('video');
  var audios = container.querySelectorAll('audio');

  videos.forEach(function(video) {
    video.pause();
    video.muted = true;
    video.currentTime = 0;

    // Remove all source children
    var sources = video.querySelectorAll('source');
    sources.forEach(function(s) { s.removeAttribute('src'); s.remove(); });

    video.removeAttribute('src');
    video.load(); // Forces the browser to release the media resource

    // Remove from DOM immediately
    video.remove();
  });

  audios.forEach(function(audio) {
    audio.pause();
    audio.muted = true;
    audio.removeAttribute('src');
    audio.load();
    audio.remove();
  });
}

async function openMedia(filePath) {
  // Ensure fresh media token before loading media
  await ensureMediaToken();

  var overlay = document.getElementById('mediaOverlay');
  var content = document.getElementById('mediaContent');
  var info = document.getElementById('mediaInfo');

  // Destroy any existing media first
  destroyMediaElements(content);

  // Build media items list from current files
  mediaItems = currentFiles.filter(function(f) { return f.type === 'image' || f.type === 'video'; });
  currentMediaIndex = -1;
  for (var i = 0; i < mediaItems.length; i++) {
    if (mediaItems[i].path === filePath) {
      currentMediaIndex = i;
      break;
    }
  }

  if (currentMediaIndex === -1) {
    // File not in current list, just open it directly
    var ext = filePath.split('.').pop().toLowerCase();
    var isVideo = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].indexOf(ext) !== -1;

    if (isVideo) {
      renderVideo(filePath);
    } else {
      renderImage(filePath);
    }

    info.textContent = filePath.split(/[\\/]/).pop();
    overlay.style.display = 'flex';
    document.getElementById('mediaPrev').style.display = 'none';
    document.getElementById('mediaNext').style.display = 'none';
    document.addEventListener('keydown', handleMediaKeydown);
    history.pushState({ type: 'media' }, '', '#media');
    return;
  }

  renderMediaItem(currentMediaIndex);
  overlay.style.display = 'flex';
  updateNavButtons();
  document.addEventListener('keydown', handleMediaKeydown);
  history.pushState({ type: 'media' }, '', '#media');
}

function closeMedia() {
  var overlay = document.getElementById('mediaOverlay');
  var content = document.getElementById('mediaContent');

  // Thoroughly destroy all media elements before hiding
  destroyMediaElements(content);

  // Clear the container content
  if (content) {
    content.innerHTML = '';
  }

  overlay.style.display = 'none';
  document.removeEventListener('keydown', handleMediaKeydown);
}

function handleMediaKeydown(e) {
  if (e.key === 'ArrowLeft') {
    navigateMedia(-1);
  } else if (e.key === 'ArrowRight') {
    navigateMedia(1);
  } else if (e.key === 'Escape') {
    closeMedia();
  }
}

function navigateMedia(direction) {
  var newIndex = currentMediaIndex + direction;
  if (newIndex < 0 || newIndex >= mediaItems.length) return;

  // Destroy current media before switching
  var content = document.getElementById('mediaContent');
  destroyMediaElements(content);

  currentMediaIndex = newIndex;
  renderMediaItem(currentMediaIndex);
  updateNavButtons();
}

function updateNavButtons() {
  document.getElementById('mediaPrev').style.display = currentMediaIndex > 0 ? 'block' : 'none';
  document.getElementById('mediaNext').style.display = currentMediaIndex < mediaItems.length - 1 ? 'block' : 'none';
}

function renderMediaItem(index) {
  var item = mediaItems[index];
  var info = document.getElementById('mediaInfo');

  if (item.type === 'video') {
    renderVideo(item.path);
  } else {
    renderImage(item.path);
  }

  info.textContent = item.name + ' — ' + (item.sizeFormatted || '') + ' — ' + (index + 1) + ' / ' + mediaItems.length;
}

function getMediaUrl(endpoint, filePath) {
  var mtoken = getMediaToken();
  return API_BASE + '/api/media/' + endpoint + '?path=' + encodeURIComponent(filePath) + '&mtoken=' + encodeURIComponent(mtoken);
}

function renderImage(filePath) {
  var content = document.getElementById('mediaContent');
  var url = getMediaUrl('image', filePath);

  var img = document.createElement('img');
  img.src = url;
  img.alt = 'Image';
  img.style.opacity = '0';
  img.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  img.style.cursor = 'zoom-in';
  img.style.maxWidth = '100%';
  img.style.maxHeight = '90vh';
  img.style.objectFit = 'contain';

  img.onload = function() {
    img.style.opacity = '1';
  };

  img.onerror = function() {
    content.innerHTML = '<p style="color: #999; text-align: center;">이미지를 불러올 수 없습니다</p>';
  };

  var zoomed = false;
  img.addEventListener('dblclick', function() {
    if (zoomed) {
      img.style.transform = 'scale(1)';
      img.style.cursor = 'zoom-in';
    } else {
      img.style.transform = 'scale(2)';
      img.style.cursor = 'zoom-out';
    }
    zoomed = !zoomed;
  });

  content.innerHTML = '';
  content.appendChild(img);
}

function renderVideo(filePath) {
  var content = document.getElementById('mediaContent');
  var url = getMediaUrl('stream', filePath);

  // Clear previous content first
  destroyMediaElements(content);
  content.innerHTML = '';

  var video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.preload = 'metadata';
  video.style.outline = 'none';
  video.style.maxWidth = '100%';
  video.style.maxHeight = '90vh';

  var source = document.createElement('source');
  source.src = url;
  source.type = 'video/mp4';
  video.appendChild(source);

  video.addEventListener('error', function() {
    // Destroy the failed video
    destroyMediaElements(content);
    content.innerHTML =
      '<div style="text-align: center; color: #999;">' +
        '<p>이 영상 포맷을 재생할 수 없습니다.</p>' +
        '<p style="font-size: 0.8rem; margin-top: 8px; color: #666;">브라우저 지원 포맷: MP4, WebM</p>' +
      '</div>';
  });

  content.appendChild(video);
}

// Attach close/nav button events via addEventListener (no inline onclick needed)
document.addEventListener('DOMContentLoaded', function() {
  var closeBtn = document.querySelector('.media-close');
  if (closeBtn) closeBtn.addEventListener('click', closeMedia);

  var prevBtn = document.getElementById('mediaPrev');
  if (prevBtn) prevBtn.addEventListener('click', function(e) { e.stopPropagation(); navigateMedia(-1); });

  var nextBtn = document.getElementById('mediaNext');
  if (nextBtn) nextBtn.addEventListener('click', function(e) { e.stopPropagation(); navigateMedia(1); });

  var overlay = document.getElementById('mediaOverlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeMedia();
    });
  }
});
