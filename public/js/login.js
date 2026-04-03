// ====================================
// WinNAS - Login Page Logic
// ====================================

// Generate device fingerprint
async function generateFingerprint() {
  const components = [];
  components.push(screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
  components.push(navigator.language);
  components.push(navigator.userAgent.substring(0, 50));

  try {
    var canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    var ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('WinNAS', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('WinNAS', 4, 17);
    components.push(canvas.toDataURL().slice(-50));
  } catch (e) {
    components.push('no-canvas');
  }

  try {
    var canvas2 = document.createElement('canvas');
    var gl = canvas2.getContext('webgl');
    if (gl) {
      var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
      }
    }
  } catch (e) {
    components.push('no-webgl');
  }

  var data = components.join('|||');
  try {
    var encoder = new TextEncoder();
    var buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    var hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  } catch (e) {
    var hash = 0;
    for (var i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash = hash & hash;
    }
    return 'fb_' + Math.abs(hash).toString(16).padStart(16, '0') + '_' + data.length;
  }
}

var deviceFingerprint = '';
var fpReady = false;

// Initialize fingerprint
generateFingerprint().then(function(fp) {
  deviceFingerprint = fp;
  fpReady = true;
  var stored = localStorage.getItem('winnas_device_name');
  if (!stored) {
    var dng = document.getElementById('deviceNameGroup');
    if (dng) dng.style.display = 'block';
  }
}).catch(function(err) {
  deviceFingerprint = 'fallback_' + Date.now() + '_' + Math.random().toString(36).substring(2);
  fpReady = true;
});

function togglePassword() {
  var input = document.getElementById('password');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function showMessage(text, type) {
  type = type || 'error';
  var msg = document.getElementById('loginMessage');
  msg.textContent = text;
  msg.className = 'login-message ' + type;
  msg.style.display = 'block';
}

function handleLogin(event) {
  event.preventDefault();
  event.stopPropagation();

  var btn = document.getElementById('loginBtn');
  var btnText = btn.querySelector('.btn-text');
  var btnLoading = btn.querySelector('.btn-loading');
  btn.disabled = true;
  btnText.style.display = 'none';
  btnLoading.style.display = 'flex';

  if (!fpReady || !deviceFingerprint) {
    deviceFingerprint = 'emergency_' + Date.now();
    fpReady = true;
  }

  var password = document.getElementById('password').value;
  if (!password) {
    showMessage('비밀번호를 입력하세요.');
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
    return;
  }

  var deviceName = '';
  var dnInput = document.getElementById('deviceName');
  if (dnInput) deviceName = dnInput.value;
  if (!deviceName) deviceName = localStorage.getItem('winnas_device_name') || '';
  if (!deviceName) deviceName = (navigator.platform || 'Device') + ' - ' + new Date().toLocaleDateString('ko');

  var body = JSON.stringify({
    password: password,
    deviceFingerprint: deviceFingerprint,
    deviceName: deviceName
  });

  fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Fingerprint': deviceFingerprint
    },
    body: body
  }).then(function(response) {
    return response.text().then(function(text) {
      return { status: response.status, ok: response.ok, text: text };
    });
  }).then(function(result) {
    var data;
    try {
      data = JSON.parse(result.text);
    } catch (e) {
      showMessage('서버 응답 오류 (' + result.status + '): ' + result.text.substring(0, 100));
      return;
    }

    if (result.ok) {
      localStorage.setItem('winnas_token', data.token);
      localStorage.setItem('winnas_device_name', deviceName);
      localStorage.setItem('winnas_device_fingerprint', deviceFingerprint);
      showMessage('로그인 성공!', 'success');
      setTimeout(function() { window.location.href = '/'; }, 500);
    } else if (data.code === 'DEVICE_PENDING') {
      document.getElementById('loginCard').style.display = 'none';
      document.getElementById('pendingCard').style.display = 'block';
      document.getElementById('pendingDeviceId').textContent = '기기 ID: ' + data.deviceId;
    } else if (data.code === 'DEVICE_BLOCKED') {
      showMessage('이 기기는 차단되었습니다.');
    } else if (data.code === 'RATE_LIMITED') {
      showMessage(data.error);
    } else {
      showMessage(data.error || '인증 실패');
    }
  }).catch(function(err) {
    showMessage('연결 오류: ' + err.message);
  }).finally(function() {
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
  });

  return false;
}

// Check if already logged in
function checkExistingAuth() {
  var token = localStorage.getItem('winnas_token');
  if (!token) return;

  var fp = localStorage.getItem('winnas_device_fingerprint');
  if (!fp) return;

  fetch('/api/auth/status', {
    headers: {
      'Authorization': 'Bearer ' + token,
      'X-Device-Fingerprint': fp
    }
  }).then(function(response) {
    if (response.ok) {
      window.location.href = '/';
    } else {
      localStorage.removeItem('winnas_token');
    }
  }).catch(function() {
    // Stay on login page
  });
}

// Attach event listener when DOM ready
document.addEventListener('DOMContentLoaded', function() {
  var form = document.getElementById('loginForm');
  if (form) {
    form.addEventListener('submit', handleLogin);
  }

  var toggleBtn = document.querySelector('.toggle-password');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', togglePassword);
  }

  checkExistingAuth();
});
