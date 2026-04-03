// ====================================
// WinNAS - Main Application Logic
// ====================================

const API_BASE = '';
let currentPath = '';
let currentView = 'grid'; // 'grid' or 'list'
let currentFilter = 'all';
let currentFiles = [];
let selectedFiles = [];
let uploadFiles = [];

// Media token management (short-lived, 5min)
var _mediaToken = '';
var _mediaTokenExpiry = 0;

function getMediaToken() {
  return _mediaToken;
}

async function refreshMediaToken() {
  try {
    var response = await fetch(API_BASE + '/api/auth/media-token', {
      headers: getHeaders()
    });
    if (response.ok) {
      var data = await response.json();
      _mediaToken = data.mtoken;
      _mediaTokenExpiry = Date.now() + (data.expiresIn - 30) * 1000; // Refresh 30s before expiry
    }
  } catch (e) {
    console.error('Media token refresh failed:', e);
  }
}

async function ensureMediaToken() {
  if (!_mediaToken || Date.now() > _mediaTokenExpiry) {
    await refreshMediaToken();
  }
  return _mediaToken;
}

// =================== Auth ===================
function getToken() {
  return localStorage.getItem('winnas_token');
}

function getFingerprint() {
  return localStorage.getItem('winnas_device_fingerprint') || '';
}

function getHeaders() {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'X-Device-Fingerprint': getFingerprint(),
    'Content-Type': 'application/json'
  };
}

async function checkAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = '/login.html';
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/status`, {
      headers: getHeaders()
    });

    if (!response.ok) {
      localStorage.removeItem('winnas_token');
      window.location.href = '/login.html';
      return false;
    }
    return true;
  } catch (err) {
    window.location.href = '/login.html';
    return false;
  }
}

async function handleLogout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: getHeaders()
    });
  } catch (e) {
    // Ignore errors
  }
  localStorage.removeItem('winnas_token');
  window.location.href = '/login.html';
}

// =================== Toast Notifications ===================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-text">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// =================== Sidebar ===================
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('open');
}

async function loadDrives() {
  try {
    const response = await fetch(`${API_BASE}/api/files/drives`, {
      headers: getHeaders()
    });

    if (!response.ok) throw new Error('Failed to load drives');

    const data = await response.json();
    const driveList = document.getElementById('driveList');
    driveList.innerHTML = '';

    data.drives.forEach(drive => {
      const btn = document.createElement('button');
      btn.className = `drive-item ${!drive.available ? 'drive-unavailable' : ''}`;
      btn.onclick = () => navigateTo(drive.path);
      btn.innerHTML = `
        <div class="drive-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
        </div>
        <div class="drive-info">
          <div class="drive-name">${drive.label}</div>
          <div class="drive-path">${drive.path}</div>
        </div>
      `;
      driveList.appendChild(btn);
    });

    // Navigate to first available drive
    if (!currentPath) {
      const firstAvailable = data.drives.find(d => d.available);
      if (firstAvailable) {
        navigateTo(firstAvailable.path);
      }
    }
  } catch (err) {
    console.error('Load drives error:', err);
    showToast('드라이브 목록을 불러올 수 없습니다.', 'error');
  }
}

// =================== View Toggle ===================
function toggleView() {
  const grid = document.getElementById('fileGrid');
  currentView = currentView === 'grid' ? 'list' : 'grid';

  if (currentView === 'list') {
    grid.classList.add('list-view');
  } else {
    grid.classList.remove('list-view');
  }

  const btn = document.getElementById('viewToggle');
  if (currentView === 'list') {
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
      </svg>
    `;
  } else {
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="8" y1="6" x2="21" y2="6"/>
        <line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/>
        <line x1="3" y1="12" x2="3.01" y2="12"/>
        <line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    `;
  }

  localStorage.setItem('winnas_view', currentView);
}

// =================== Filter ===================
function filterByType(type) {
  currentFilter = type;

  // Update active state
  document.querySelectorAll('.sidebar-item[data-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === type);
  });

  renderFiles(currentFiles);
}

// =================== Search ===================
async function performSearch() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;

  showLoading(true);

  try {
    const params = new URLSearchParams({ query, path: currentPath });
    if (currentFilter !== 'all') {
      params.set('type', currentFilter);
    }

    const response = await fetch(`${API_BASE}/api/files/search?${params}`, {
      headers: getHeaders()
    });

    if (!response.ok) throw new Error('Search failed');

    const data = await response.json();
    currentFiles = data.results;

    document.getElementById('contentInfo').textContent = `검색 결과: ${data.total}개`;
    renderFiles(currentFiles);
  } catch (err) {
    console.error('Search error:', err);
    showToast('검색에 실패했습니다.', 'error');
  } finally {
    showLoading(false);
  }
}

// =================== Upload ===================
function openUpload() {
  document.getElementById('uploadModal').style.display = 'flex';
  uploadFiles = [];
  renderUploadList();
}

function closeUpload() {
  document.getElementById('uploadModal').style.display = 'none';
  uploadFiles = [];
  renderUploadList();
  document.getElementById('uploadProgress').style.display = 'none';
}

function handleDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');

  const files = Array.from(event.dataTransfer.files);
  uploadFiles = [...uploadFiles, ...files];
  renderUploadList();
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  uploadFiles = [...uploadFiles, ...files];
  renderUploadList();
}

function removeUploadFile(index) {
  uploadFiles.splice(index, 1);
  renderUploadList();
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function renderUploadList() {
  const list = document.getElementById('uploadList');
  const submit = document.getElementById('uploadSubmit');

  if (uploadFiles.length === 0) {
    list.innerHTML = '';
    submit.disabled = true;
    return;
  }

  submit.disabled = false;
  list.innerHTML = uploadFiles.map((file, i) => `
    <div class="upload-item">
      <span class="upload-item-name">${file.name}</span>
      <span class="upload-item-size">${formatSize(file.size)}</span>
      <button class="upload-item-remove" onclick="removeUploadFile(${i})">✕</button>
    </div>
  `).join('');
}

async function startUpload() {
  if (uploadFiles.length === 0) return;

  const progress = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const submitBtn = document.getElementById('uploadSubmit');

  progress.style.display = 'flex';
  submitBtn.disabled = true;

  const formData = new FormData();
  formData.append('path', currentPath);
  uploadFiles.forEach(file => formData.append('files', file));

  try {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = `${percent}%`;
        progressText.textContent = `${percent}%`;
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        showToast(`${data.files.length}개 파일 업로드 완료!`, 'success');
        closeUpload();
        navigateTo(currentPath); // Refresh
      } else {
        const err = JSON.parse(xhr.responseText);
        showToast(err.error || '업로드 실패', 'error');
      }
      submitBtn.disabled = false;
    };

    xhr.onerror = () => {
      showToast('업로드 중 오류가 발생했습니다.', 'error');
      submitBtn.disabled = false;
    };

    xhr.open('POST', `${API_BASE}/api/files/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
    xhr.setRequestHeader('X-Device-Fingerprint', getFingerprint());
    xhr.send(formData);
  } catch (err) {
    console.error('Upload error:', err);
    showToast('업로드 실패', 'error');
    submitBtn.disabled = false;
  }
}

// =================== Notifications ===================
function toggleNotifications() {
  const panel = document.getElementById('notificationPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  loadPendingDevices();
}

function closeNotifications() {
  document.getElementById('notificationPanel').style.display = 'none';
}

async function loadPendingDevices() {
  try {
    const response = await fetch(`${API_BASE}/api/devices/pending`, {
      headers: getHeaders()
    });

    if (!response.ok) return;

    const data = await response.json();
    const badge = document.getElementById('notificationBadge');
    const pendingCount = document.getElementById('pendingCount');
    const list = document.getElementById('notificationList');

    if (data.devices.length > 0) {
      badge.textContent = data.devices.length;
      badge.style.display = 'flex';
      pendingCount.textContent = data.devices.length;
      pendingCount.style.display = 'inline';

      list.innerHTML = data.devices.map(device => `
        <div class="notification-item" onclick="openDeviceManager()">
          <div class="notification-item-title">🔔 새 기기 등록 요청: ${device.name}</div>
          <div class="notification-item-time">${new Date(device.created_at).toLocaleString('ko')}</div>
        </div>
      `).join('');
    } else {
      badge.style.display = 'none';
      pendingCount.style.display = 'none';
      list.innerHTML = '<p class="notification-empty">새 알림이 없습니다</p>';
    }
  } catch (err) {
    console.error('Load pending devices error:', err);
  }
}

// =================== Settings ===================
function openSettings() {
  document.getElementById('settingsModal').style.display = 'flex';
  switchSettingsTab('password', document.querySelector('.settings-tab'));
}

function closeSettings() {
  document.getElementById('settingsModal').style.display = 'none';
}

function switchSettingsTab(tab, btn) {
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  document.querySelectorAll('.settings-content').forEach(c => c.style.display = 'none');
  document.getElementById(`tab-${tab}`).style.display = 'block';

  if (tab === 'devices') {
    loadDeviceList();
  } else if (tab === 'system') {
    loadStartupStatus();
  }
}

async function loadStartupStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/system/startup`, {
      headers: getHeaders()
    });
    if (response.ok) {
      const data = await response.json();
      document.getElementById('startupToggle').checked = data.enabled;
    }
  } catch (err) {
    console.error('Load startup status error:', err);
  }
}

async function toggleStartup(enabled) {
  try {
    const response = await fetch(`${API_BASE}/api/system/startup`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ enabled })
    });

    const data = await response.json();

    if (response.ok) {
      showToast(data.message, 'success');
    } else {
      showToast(data.error || '설정 변경 실패', 'error');
      // Revert toggle
      document.getElementById('startupToggle').checked = !enabled;
    }
  } catch (err) {
    showToast('시작프로그램 설정 변경에 실패했습니다.', 'error');
    document.getElementById('startupToggle').checked = !enabled;
  }
}

async function changePassword(event) {
  event.preventDefault();

  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmNewPassword = document.getElementById('confirmNewPassword').value;

  if (newPassword !== confirmNewPassword) {
    showToast('새 비밀번호가 일치하지 않습니다.', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/password`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await response.json();

    if (response.ok) {
      showToast('비밀번호가 변경되었습니다.', 'success');
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmNewPassword').value = '';
    } else {
      showToast(data.error || '비밀번호 변경 실패', 'error');
    }
  } catch (err) {
    showToast('비밀번호 변경에 실패했습니다.', 'error');
  }
}

// =================== Device Manager ===================
function openDeviceManager() {
  closeNotifications();
  openSettings();
  // Switch to devices tab
  const devicesTab = document.querySelectorAll('.settings-tab')[1];
  switchSettingsTab('devices', devicesTab);
}

async function loadDeviceList() {
  try {
    const response = await fetch(`${API_BASE}/api/devices`, {
      headers: getHeaders()
    });

    if (!response.ok) throw new Error('Failed to load devices');

    const data = await response.json();
    const container = document.getElementById('deviceListContainer');

    container.innerHTML = data.devices.map(device => `
      <div class="device-card">
        <div class="device-card-info">
          <div class="device-card-name">${device.name}</div>
          <div class="device-card-meta">
            <span>${device.ip_address || '알 수 없음'}</span>
            <span>${device.last_seen ? new Date(device.last_seen).toLocaleString('ko') : '접속 기록 없음'}</span>
          </div>
        </div>
        <span class="device-status ${device.status}">${
          device.status === 'approved' ? '승인됨' :
          device.status === 'pending' ? '대기중' : '차단됨'
        }</span>
        <div class="device-card-actions">
          ${device.status === 'pending' ? `
            <button class="btn-success" onclick="approveDevice('${device.id}')">승인</button>
            <button class="btn-danger" onclick="blockDevice('${device.id}')">차단</button>
          ` : ''}
          ${device.status === 'approved' ? `
            <button class="btn-danger" onclick="blockDevice('${device.id}')">차단</button>
          ` : ''}
          ${device.status === 'blocked' ? `
            <button class="btn-success" onclick="approveDevice('${device.id}')">승인</button>
            <button class="btn-danger" onclick="removeDevice('${device.id}')">삭제</button>
          ` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Load devices error:', err);
  }
}

async function approveDevice(id) {
  try {
    const response = await fetch(`${API_BASE}/api/devices/${id}/approve`, {
      method: 'PUT',
      headers: getHeaders()
    });

    if (response.ok) {
      showToast('기기가 승인되었습니다.', 'success');
      loadDeviceList();
      loadPendingDevices();
    }
  } catch (err) {
    showToast('기기 승인 실패', 'error');
  }
}

async function blockDevice(id) {
  if (!confirm('이 기기를 차단하시겠습니까?')) return;

  try {
    const response = await fetch(`${API_BASE}/api/devices/${id}/block`, {
      method: 'PUT',
      headers: getHeaders()
    });

    if (response.ok) {
      showToast('기기가 차단되었습니다.', 'success');
      loadDeviceList();
    }
  } catch (err) {
    showToast('기기 차단 실패', 'error');
  }
}

async function removeDevice(id) {
  if (!confirm('이 기기를 삭제하시겠습니까?')) return;

  try {
    const response = await fetch(`${API_BASE}/api/devices/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });

    if (response.ok) {
      showToast('기기가 삭제되었습니다.', 'success');
      loadDeviceList();
    }
  } catch (err) {
    showToast('기기 삭제 실패', 'error');
  }
}

// =================== Loading ===================
function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

// =================== Initialize ===================
async function init() {
  const isAuth = await checkAuth();
  if (!isAuth) return;

  // Load saved view preference
  const savedView = localStorage.getItem('winnas_view');
  if (savedView === 'list') {
    currentView = 'grid'; // Will be toggled
    toggleView();
  }

  // Get initial media token for thumbnails
  await refreshMediaToken();

  await loadDrives();
  loadPendingDevices();

  // Poll for pending devices every 30 seconds
  setInterval(loadPendingDevices, 30000);

  // Refresh media token every 4 minutes
  setInterval(refreshMediaToken, 240000);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMedia();
      closeUpload();
      closeSettings();
      closeNotifications();
    }

    if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      openUpload();
    }
  });
}

init();
