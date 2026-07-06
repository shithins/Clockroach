let currentEmployee = null;
let runningEntry = null;
let timerInterval = null;
let activeProjects = [];
let dashboardEntries = [];
let currentSortDirection = 'desc';
let editingEntryId = null;

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

    activeProjects = projects;
    
    // Reset views
    $('trackerView').style.display = 'block';
    $('dashboardView').style.display = 'none';
    $('tabTracker').classList.add('active');
    $('tabDashboard').classList.remove('active');
    $('editEntryModal').style.display = 'none';

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

// ---------- DASHBOARD & EDITING LOGIC ----------

// Tab switching
$('tabTracker').addEventListener('click', () => {
  $('tabTracker').classList.add('active');
  $('tabDashboard').classList.remove('active');
  $('trackerView').style.display = 'block';
  $('dashboardView').style.display = 'none';
});

$('tabDashboard').addEventListener('click', async () => {
  $('tabDashboard').classList.add('active');
  $('tabTracker').classList.remove('active');
  $('dashboardView').style.display = 'block';
  $('trackerView').style.display = 'none';
  await loadDashboard();
});

// Load Dashboard Data
async function loadDashboard() {
  if (!currentEmployee) return;
  
  $('dashboardLoading').style.display = 'block';
  $('entriesList').style.display = 'none';
  $('editEntryModal').style.display = 'none';
  
  try {
    const result = await apiCall('getEmployeeDashboardData', { email: currentEmployee.email });
    if (result.error) {
      $('dashboardLoading').textContent = `Error: ${result.error}`;
      return;
    }
    
    // Display stats
    $('weekHours').textContent = `${result.week_hours}h`;
    $('monthHours').textContent = `${result.month_hours}h`;
    
    dashboardEntries = result.entries || [];
    
    $('dashboardLoading').style.display = 'none';
    $('entriesList').style.display = 'flex';
    
    renderDashboardEntries();
  } catch (err) {
    $('dashboardLoading').textContent = `Network error: ${err.message}`;
  }
}

// Render entries
function renderDashboardEntries() {
  const container = $('entriesList');
  container.innerHTML = '';
  
  if (dashboardEntries.length === 0) {
    container.innerHTML = '<div class="status" style="margin-top: 20px;">No completed time entries.</div>';
    return;
  }
  
  // Sort entries client-side based on currentSortDirection
  const sorted = [...dashboardEntries].sort((a, b) => {
    const dateA = new Date(a.start_time);
    const dateB = new Date(b.start_time);
    return currentSortDirection === 'desc' ? dateB - dateA : dateA - dateB;
  });
  
  // Find IDs of the last 4 completed entries (always chronologically latest)
  // By sorting descending by start_time first, we find the 4 latest completed entries
  const latestCompleted4Ids = [...dashboardEntries]
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .slice(0, 4)
    .map(e => e.entry_id);
    
  sorted.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'entry-item';
    
    const isEditable = latestCompleted4Ids.includes(entry.entry_id);
    
    // Format Date: e.g. "Mon, Jul 6"
    const startDate = new Date(entry.start_time);
    const dateStr = startDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    
    // Format Time: e.g. "10:15 AM - 11:30 AM"
    const startTimeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let endTimeStr = 'Running';
    if (entry.end_time) {
      endTimeStr = new Date(entry.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Format Duration: e.g. "1h 15m" or "45m"
    const mins = Number(entry.duration_minutes) || 0;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    const durationStr = hrs > 0 ? `${hrs}h ${remMins}m` : `${remMins}m`;
    
    item.innerHTML = `
      <div class="entry-item-header">
        <div style="flex: 1; min-width: 0;">
          <div class="entry-task" title="${escapeHtml(entry.task_description)}">${escapeHtml(entry.task_description || '(No description)')}</div>
          <div class="entry-project">${escapeHtml(entry.project_name || 'No Project')}</div>
        </div>
        ${isEditable ? `
          <button class="entry-edit-btn" data-id="${entry.entry_id}" title="Edit Duration">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
        ` : ''}
      </div>
      <div class="entry-meta">
        <span>${dateStr} • ${startTimeStr} - ${endTimeStr}</span>
        <span style="font-weight: 600; color: var(--text-primary);">${durationStr}</span>
      </div>
    `;
    
    // Wire up the edit button event listener
    if (isEditable) {
      item.querySelector('.entry-edit-btn').addEventListener('click', () => {
        openEditModal(entry);
      });
    }
    
    container.appendChild(item);
  });
}

// Sort button handler
$('sortBtn').addEventListener('click', () => {
  currentSortDirection = currentSortDirection === 'desc' ? 'asc' : 'desc';
  $('sortDirectionText').textContent = currentSortDirection === 'desc' ? 'Newest' : 'Oldest';
  
  // Rotate/flip the sorting SVG arrow icon indicator
  const svg = $('sortBtn').querySelector('svg');
  if (currentSortDirection === 'desc') {
    svg.style.transform = 'none';
  } else {
    svg.style.transform = 'rotate(180deg)';
  }
  
  renderDashboardEntries();
});

// Edit modal opening
function openEditModal(entry) {
  editingEntryId = entry.entry_id;
  $('editError').style.display = 'none';
  
  $('editEntryInfoProject').textContent = entry.project_name || 'No Project';
  $('editEntryInfoTask').textContent = entry.task_description || '(No description)';
  
  const origMins = Number(entry.duration_minutes) || 0;
  const origH = Math.floor(origMins / 60);
  const origM = origMins % 60;
  
  $('editEntryInfoOriginal').textContent = `Original Duration: ${origH}h ${origM}m (Max allowed)`;
  
  $('editHoursInput').value = origH;
  $('editMinutesInput').value = origM;
  
  // Set dataset attributes for validation
  $('editEntryModal').dataset.originalMinutes = origMins;
  
  $('editEntryModal').style.display = 'flex';
}

// Close modal handlers
$('cancelEditBtn').addEventListener('click', () => {
  $('editEntryModal').style.display = 'none';
  editingEntryId = null;
});

// Save edits handler
$('saveEditBtn').addEventListener('click', async () => {
  if (!editingEntryId) return;
  
  $('editError').style.display = 'none';
  
  const originalMinutes = Number($('editEntryModal').dataset.originalMinutes) || 0;
  const newHours = parseInt($('editHoursInput').value || 0, 10);
  const newMinutesVal = parseInt($('editMinutesInput').value || 0, 10);
  
  if (isNaN(newHours) || newHours < 0 || isNaN(newMinutesVal) || newMinutesVal < 0 || newMinutesVal > 59) {
    showEditError('Please enter valid hours and minutes (0-59).');
    return;
  }
  
  const newMinutes = newHours * 60 + newMinutesVal;
  
  if (newMinutes > originalMinutes) {
    const origH = Math.floor(originalMinutes / 60);
    const origM = originalMinutes % 60;
    showEditError(`Duration cannot exceed the original duration of ${origH}h ${origM}m.`);
    return;
  }
  
  if (newMinutes === originalMinutes) {
    // No changes, close modal directly
    $('editEntryModal').style.display = 'none';
    editingEntryId = null;
    return;
  }
  
  // Optimistic UI saving state
  $('saveEditBtn').disabled = true;
  const originalBtnText = $('saveEditBtn').innerHTML;
  $('saveEditBtn').innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite; margin-right: 4px;"><circle cx="12" cy="12" r="10"></circle></svg> Saving...`;
  
  try {
    const result = await apiCall('updateTimeEntry', {
      email: currentEmployee.email,
      entry_id: editingEntryId,
      new_duration_minutes: newMinutes
    });
    
    $('saveEditBtn').disabled = false;
    $('saveEditBtn').innerHTML = originalBtnText;
    
    if (result.error) {
      showEditError(result.error);
      return;
    }
    
    // Close modal and refresh dashboard
    $('editEntryModal').style.display = 'none';
    editingEntryId = null;
    await loadDashboard();
  } catch (err) {
    $('saveEditBtn').disabled = false;
    $('saveEditBtn').innerHTML = originalBtnText;
    showEditError(`Error updating duration: ${err.message}`);
  }
});

function showEditError(msg) {
  $('editError').textContent = msg;
  $('editError').style.display = 'block';
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
