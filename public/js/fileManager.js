// ====================================
// WinNAS - File Manager
// ====================================

// Track navigation for back button
var navHistory = [];
var isPopState = false;

async function navigateTo(filePath, skipPushState) {
  showLoading(true);

  // Push to browser history for mobile back button
  if (!skipPushState && currentPath && currentPath !== filePath) {
    history.pushState({ path: filePath, type: 'browse' }, '', '#' + encodeURIComponent(filePath));
  }

  currentPath = filePath;

  try {
    var response = await fetch(API_BASE + '/api/files/browse?path=' + encodeURIComponent(filePath), {
      headers: getHeaders()
    });

    if (!response.ok) {
      var err = await response.json();
      throw new Error(err.error || 'Failed to browse');
    }

    var data = await response.json();
    currentFiles = data.items;

    // Update breadcrumb
    renderBreadcrumb(data);

    // Update content info
    var dirs = data.items.filter(function(i) { return i.isDirectory; }).length;
    var files = data.items.filter(function(i) { return !i.isDirectory; }).length;
    document.getElementById('contentInfo').textContent = '폴더 ' + dirs + '개, 파일 ' + files + '개';

    // Update drive active state
    document.querySelectorAll('.drive-item').forEach(function(btn) {
      var dp = btn.querySelector('.drive-path');
      var drivePath = dp ? dp.textContent : '';
      btn.classList.toggle('active', filePath.startsWith(drivePath));
    });

    // Render files
    renderFiles(currentFiles);

    // Close sidebar on mobile
    document.getElementById('sidebar').classList.remove('open');
  } catch (err) {
    console.error('Navigate error:', err);
    showToast(err.message || '디렉토리를 열 수 없습니다.', 'error');
  } finally {
    showLoading(false);
  }
}

// Handle browser back button
window.addEventListener('popstate', function(e) {
  var state = e.state;

  // If media viewer is open, close it
  var mediaOverlay = document.getElementById('mediaOverlay');
  if (mediaOverlay && mediaOverlay.style.display !== 'none') {
    closeMedia();
    return;
  }

  // If modal is open, close it
  var uploadModal = document.getElementById('uploadModal');
  if (uploadModal && uploadModal.style.display !== 'none') {
    closeUpload();
    return;
  }
  var settingsModal = document.getElementById('settingsModal');
  if (settingsModal && settingsModal.style.display !== 'none') {
    closeSettings();
    return;
  }

  // Navigate to previous directory
  if (state && state.path) {
    navigateTo(state.path, true);
  } else if (currentPath) {
    // Go to parent directory
    var parts = currentPath.replace(/[\\/]+$/, '').split(/[\\/]/);
    if (parts.length > 1) {
      parts.pop();
      var parentPath = parts.join('\\');
      if (parentPath.length === 2 && parentPath[1] === ':') parentPath += '\\';
      navigateTo(parentPath, true);
    }
  }
});

// =================== Breadcrumb ===================
function renderBreadcrumb(data) {
  var breadcrumb = document.getElementById('breadcrumb');
  var parts = data.currentPath.split(/[\\/]/).filter(Boolean);
  breadcrumb.innerHTML = '';

  parts.forEach(function(part, index) {
    if (index > 0) {
      var sep = document.createElement('span');
      sep.className = 'breadcrumb-separator';
      sep.textContent = '›';
      breadcrumb.appendChild(sep);
    }

    if (index === parts.length - 1) {
      var span = document.createElement('span');
      span.className = 'breadcrumb-item current';
      span.textContent = part;
      breadcrumb.appendChild(span);
    } else {
      var btn = document.createElement('button');
      btn.className = 'breadcrumb-item';
      btn.textContent = (index === 0 ? '💾 ' : '') + part;
      var partPath = parts.slice(0, index + 1).join('\\') + '\\';
      btn.addEventListener('click', (function(p) {
        return function() { navigateTo(p); };
      })(partPath));
      breadcrumb.appendChild(btn);
    }
  });
}

// =================== File Rendering ===================
function renderFiles(files) {
  var grid = document.getElementById('fileGrid');
  var emptyState = document.getElementById('emptyState');

  // Apply filter
  var filtered = files;
  if (currentFilter !== 'all') {
    filtered = files.filter(function(f) { return f.isDirectory || f.type === currentFilter; });
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  grid.innerHTML = '';

  filtered.forEach(function(file, index) {
    var card = document.createElement('div');
    card.className = 'file-card' + (file.isDirectory ? ' directory' : '');
    card.style.animationDelay = Math.min(index * 30, 500) + 'ms';

    if (file.isDirectory) {
      card.innerHTML =
        '<div class="file-icon">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
            '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
          '</svg>' +
        '</div>' +
        '<div class="file-name">' + escapeHtml(file.name) + '</div>' +
        '<div class="file-meta">폴더</div>';

      card.addEventListener('click', (function(p) {
        return function() { navigateTo(p); };
      })(file.path));

    } else {
      var isImage = file.type === 'image';
      var isVideo = file.type === 'video';
      var isMedia = isImage || isVideo;

      var actionsHtml =
        '<div class="file-actions">' +
          '<button class="file-action-btn" data-download-path title="다운로드">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
              '<polyline points="7,10 12,15 17,10"/>' +
              '<line x1="12" y1="15" x2="12" y2="3"/>' +
            '</svg>' +
          '</button>' +
        '</div>';

      var contentHtml = '';
      if (isImage) {
        var thumbUrl = API_BASE + '/api/media/thumbnail?path=' + encodeURIComponent(file.path) + '&mtoken=' + encodeURIComponent(getMediaToken());
        contentHtml =
          '<img class="file-thumbnail" src="' + thumbUrl + '" alt="' + escapeHtml(file.name) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
          '<div class="file-icon type-image" style="display:none">' + getFileIcon('image') + '</div>';
      } else {
        contentHtml = '<div class="file-icon type-' + (file.type || 'other') + '">' + getFileIcon(file.type) + '</div>';
      }

      card.innerHTML = actionsHtml + contentHtml +
        '<div class="file-name">' + escapeHtml(file.name) + '</div>' +
        '<div class="file-meta">' + (file.sizeFormatted || '') + '</div>';

      // Main click handler
      card.addEventListener('click', (function(f, media) {
        return function() {
          if (media) {
            openMedia(f.path);
          } else {
            downloadFile(f.path);
          }
        };
      })(file, isMedia));

      // Download button click (prevent bubble)
      var dlBtn = card.querySelector('[data-download-path]');
      if (dlBtn) {
        dlBtn.addEventListener('click', (function(p) {
          return function(e) {
            e.stopPropagation();
            downloadFile(p);
          };
        })(file.path));
      }
    }

    grid.appendChild(card);
  });
}

function getFileIcon(type) {
  var icons = {
    image: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>',
    video: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23,7 16,12 23,17 23,7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    document: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    archive: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="21,8 21,21 3,21 3,8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
    other: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13,2 13,9 20,9"/></svg>'
  };
  return icons[type] || icons.other;
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =================== Download ===================
function downloadFile(filePath) {
  var token = getToken();
  var fp = getFingerprint();

  fetch(API_BASE + '/api/files/download?path=' + encodeURIComponent(filePath), {
    headers: {
      'Authorization': 'Bearer ' + token,
      'X-Device-Fingerprint': fp
    }
  })
  .then(function(response) {
    if (!response.ok) throw new Error('Download failed');
    return response.blob();
  })
  .then(function(blob) {
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filePath.split(/[\\/]/).pop();
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    showToast('다운로드 시작!', 'success');
  })
  .catch(function(err) {
    console.error('Download error:', err);
    showToast('다운로드에 실패했습니다.', 'error');
  });
}
