let currentEmployee = null;
let runningEntry = null;
let timerInterval = null;

const $ = id => document.getElementById(id);

// ---------- THEME WORK ----------
async function initTheme() {
  const stored = await chrome.storage.local.get('theme');
  if (stored.theme === 'light') {
    document.body.classList.add('light-theme');
    updateThemeIcon(true);
  } else {
    document.body.classList.remove('light-theme');
    updateThemeIcon(false);
  }
}

function updateThemeIcon(isLight) {
  const icon = $('themeToggleIcon');
  if (!icon) return;
  if (isLight) {
    // Sun icon
    icon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
  } else {
    // Moon icon
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
  }
}

$('themeToggleBtn').addEventListener('click', async () => {
  const isLight = document.body.classList.toggle('light-theme');
  await chrome.storage.local.set({ theme: isLight ? 'light' : 'dark' });
  updateThemeIcon(isLight);
});

// ---------- AUTH & INITIALIZATION ----------
async function init() {
  await initTheme();

  // 1. Check if we have a saved email in local storage
  const stored = await chrome.storage.local.get('userEmail');
  if (stored.userEmail) {
    await loginWithEmail(stored.userEmail);
    return;
  }

  // 2. Fallback to trying chrome.identity
  chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, async (info) => {
    if (info && info.email) {
      await loginWithEmail(info.email);
    } else {
      // Show manual email sign-in form if identity detection fails
      $('loadingState').style.display = 'none';
      $('emailSigninForm').style.display = 'block';
    }
  });
}

async function loginWithEmail(email) {
  $('loadingState').style.display = 'block';
  $('loadingState').textContent = 'Connecting to database...';
  $('emailSigninForm').style.display = 'none';
  $('loginError').style.display = 'none';
  
  try {
    // Parallelize first checks (profile details + running timer status)
    const [emp, running] = await Promise.all([
      apiCall('getEmployee', { email: email }),
      apiCall('getRunningTimer', { email: email })
    ]);

    if (emp.error) {
      showError(`No employee record found for ${email}. Ask your admin to add you.`);
      $('emailSigninForm').style.display = 'block';
      return;
    }
    
    // Save email for subsequent visits
    await chrome.storage.local.set({ userEmail: email });
    currentEmployee = emp;
    
    $('greeting').textContent = `Hi, ${emp.name}`;
    $('greeting').style.display = 'block';
    $('loadingState').style.display = 'none';
    $('mainView').style.display = 'block';
    if (emp.role === 'admin') $('adminLink').style.display = 'block';

    // Parallelize setup configuration (projects list + preset tasks)
    const [projects, tasks] = await Promise.all([
      apiCall('getProjects', { department: currentEmployee.department }),
      apiCall('getTaskPresets', { department: currentEmployee.department })
    ]);

    const select = $('projectSelect');
    if (projects.length === 0) {
      select.innerHTML = '<option value="">No projects active</option>';
    } else {
      select.innerHTML = projects.map(p => `<option value="${p.project_id}">${p.project_name}</option>`).join('');
    }

    $('taskSuggestions').innerHTML = tasks.map(t => `<option value="${t.task_name}">`).join('');

    // Setup initial timer states
    if (running && running.entry_id) {
      runningEntry = running;
      showRunningState();
    } else {
      showStartState();
    }
  } catch (err) {
    showError(`Network error connecting to spreadsheet backend: ${err.message}`);
    $('emailSigninForm').style.display = 'block';
  }
}

function showError(msg) {
  $('loadingState').style.display = 'none';
  $('greeting').style.display = 'none';
  $('loginError').style.display = 'block';
  $('loginError').textContent = msg;
}

function showStartState() {
  $('startForm').style.display = 'block';
  $('stopBtn').style.display = 'none';
  $('timerContainer').style.display = 'none';
  $('timerCircle').classList.remove('active');
  $('timerDisplay').classList.remove('active');
  if (timerInterval) clearInterval(timerInterval);
}

function showRunningState() {
  $('startForm').style.display = 'none';
  $('stopBtn').style.display = 'block';
  $('timerContainer').style.display = 'flex';
  $('timerCircle').classList.add('active');
  $('timerDisplay').classList.add('active');
  $('runningTaskLabel').textContent = `${runningEntry.project_name}: ${runningEntry.task_description}`;

  const startTime = new Date(runningEntry.start_time);
  if (timerInterval) clearInterval(timerInterval);
  
  const updateTimerText = () => {
    const elapsed = Math.floor((new Date() - startTime) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    $('timerDisplay').textContent = `${h}:${m}:${s}`;
  };

  updateTimerText(); // execute immediately to avoid 1-second blank gap
  timerInterval = setInterval(updateTimerText, 1000);
}

// ---------- BUTTON HANDLERS (OPTIMISTIC UI UPDATES) ----------
$('startBtn').addEventListener('click', async () => {
  const projectId = $('projectSelect').value;
  const task = $('taskInput').value.trim();
  if (!projectId) { alert('No project is selected.'); return; }
  if (!task) { alert('Enter or pick a task description.'); return; }

  // 1. Instantly transition to optimistic starting spinner to eliminate database latency delay
  $('startBtn').disabled = true;
  $('startBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg> Starting...`;

  try {
    const result = await apiCall('startTimer', {
      email: currentEmployee.email,
      project_id: projectId,
      task_description: task
    });
    
    // Reset starting state
    $('startBtn').disabled = false;
    $('startBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Timer`;

    if (result.error) { alert(result.error); return; }

    // 2. Set running timer state instantly client-side without hitting database again
    const selectEl = $('projectSelect');
    const selectedProjectText = selectEl.options[selectEl.selectedIndex].text;
    runningEntry = {
      entry_id: result.entry_id,
      project_id: projectId,
      project_name: selectedProjectText,
      task_description: task,
      start_time: new Date().toISOString()
    };
    
    showRunningState();

    // Record start time locally for background alerts
    chrome.storage.local.set({
      runningTimer: { entry_id: result.entry_id, started_at: Date.now() }
    });
    chrome.alarms.create('staleTimerCheck', { periodInMinutes: 30 });
  } catch (e) {
    alert(`Could not start timer: ${e.message}`);
    $('startBtn').disabled = false;
    $('startBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Timer`;
  }
});

$('stopBtn').addEventListener('click', async () => {
  if (!runningEntry) return;

  // 1. Instantly show optimistic loading text
  $('stopBtn').disabled = true;
  $('stopBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg> Stopping...`;

  try {
    await apiCall('stopTimer', { entry_id: runningEntry.entry_id });

    // Reset button states
    $('stopBtn').disabled = false;
    $('stopBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect></svg> Stop Timer`;

    // 2. Clean state immediately
    runningEntry = null;
    chrome.storage.local.remove('runningTimer');
    chrome.alarms.clear('staleTimerCheck');
    $('taskInput').value = '';
    showStartState();
  } catch (e) {
    alert(`Could not stop timer: ${e.message}`);
    $('stopBtn').disabled = false;
    $('stopBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect></svg> Stop Timer`;
  }
});

// Spin keyframe injector
const style = document.createElement('style');
style.textContent = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
document.head.appendChild(style);

$('signinBtn').addEventListener('click', async () => {
  const email = $('signinEmail').value.trim();
  if (!email) { alert('Please enter your email.'); return; }
  await loginWithEmail(email);
});

$('adminLink').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('admin.html') });
});

$('logoutLink').addEventListener('click', async () => {
  if (confirm('Are you sure you want to sign out and switch accounts?')) {
    await chrome.storage.local.remove('userEmail');
    window.location.reload();
  }
});

init();
