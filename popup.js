let currentEmployee = null;
let runningEntry = null;
let timerInterval = null;
let activeProjects = [];
let dashboardEntries = [];
let currentSortDirection = 'desc';
let editingEntryId = null;

let authToken = null;
let spreadsheetId = null;
let userEmail = null;
let userName = null;

const $ = id => document.getElementById(id);

const HEADERS = {
  Employees: ['employee_id', 'email', 'name', 'department', 'role', 'active'],
  Departments: ['department_id', 'department_name'],
  Projects: ['project_id', 'project_name', 'department', 'active'],
  TaskPresets: ['task_id', 'task_name', 'department', 'active'],
  TimeEntries: ['entry_id', 'employee_email', 'project_id', 'project_name', 'department', 'task_description', 'start_time', 'end_time', 'duration_minutes']
};

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
    icon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
  } else {
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

  // Try to sign in silently first
  try {
    const token = await GoogleAPI.getAuthToken(false);
    if (token) {
      authToken = token;
      await loginWithToken(token);
    } else {
      showSignInForm();
    }
  } catch (err) {
    showSignInForm();
  }
}

function showSignInForm() {
  $('loadingState').style.display = 'none';
  $('greeting').style.display = 'none';
  $('mainView').style.display = 'none';
  $('googleSigninForm').style.display = 'block';
}

async function loginWithToken(token) {
  $('loadingState').style.display = 'block';
  $('loadingState').textContent = 'Connecting to Google Account...';
  $('googleSigninForm').style.display = 'none';
  $('loginError').style.display = 'none';

  try {
    // 1. Fetch user profile from Google OAuth
    const profile = await fetchUserProfile(token);
    userEmail = profile.email;
    userName = profile.name || 'User';

    // 2. Discover spreadsheet
    $('loadingState').textContent = 'Searching for Clockroach spreadsheet...';
    spreadsheetId = await GoogleAPI.findSpreadsheet(token);

    // 3. Create one if it does not exist
    if (!spreadsheetId) {
      $('loadingState').textContent = 'Creating new Clockroach spreadsheet...';
      spreadsheetId = await GoogleAPI.createSpreadsheet(token, userEmail);
    }

    // 4. Read Employees sheet to verify user
    $('loadingState').textContent = 'Verifying employee record...';
    const employees = await GoogleAPI.listAll(spreadsheetId, token, 'Employees');
    
    // Check for active employee record
    const emp = employees.find(e => e.email.toLowerCase() === userEmail.toLowerCase() && (e.active === 'TRUE' || e.active === true));
    
    if (!emp) {
      showError(`Access Denied: No employee record found for ${userEmail}. Ask your admin to add you to the "Employees" tab of the Google Sheet.`);
      $('googleSigninForm').style.display = 'block';
      return;
    }

    currentEmployee = emp;

    $('greeting').textContent = `Hi, ${emp.name}`;
    $('greeting').style.display = 'block';
    $('loadingState').style.display = 'none';
    $('mainView').style.display = 'block';

    // Show direct Sheet and Guide links
    $('sheetLink').href = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    $('sheetLink').style.display = 'inline-block';
    $('guideLink').style.display = 'inline-block';

    if (emp.role === 'admin') {
      $('adminLink').style.display = 'block';
    } else {
      $('adminLink').style.display = 'none';
    }

    // Reset views to default Tracker
    $('trackerView').style.display = 'block';
    $('dashboardView').style.display = 'none';
    $('tabTracker').classList.add('active');
    $('tabDashboard').classList.remove('active');
    $('editEntryModal').style.display = 'none';

    // 5. Fetch projects and task presets
    const [projects, tasks, timeEntries] = await Promise.all([
      GoogleAPI.listAll(spreadsheetId, token, 'Projects'),
      GoogleAPI.listAll(spreadsheetId, token, 'TaskPresets'),
      GoogleAPI.listAll(spreadsheetId, token, 'TimeEntries')
    ]);

    // Cache active projects matching department
    activeProjects = projects.filter(p => {
      const isActive = String(p.active) === 'TRUE' || p.active === true;
      if (!isActive) return false;
      if (!p.department) return true; // global project
      
      const depts = String(p.department).split(',').map(d => d.trim().toLowerCase());
      return depts.includes(currentEmployee.department.toLowerCase());
    });

    const select = $('projectSelect');
    if (activeProjects.length === 0) {
      select.innerHTML = '<option value="">No projects active</option>';
    } else {
      select.innerHTML = activeProjects.map(p => `<option value="${p.project_id}">${p.project_name}</option>`).join('');
    }

    // Filter task presets
    const departmentTasks = tasks.filter(t => {
      const isActive = String(t.active) === 'TRUE' || t.active === true;
      return isActive && t.department === currentEmployee.department;
    });
    $('taskSuggestions').innerHTML = departmentTasks.map(t => `<option value="${t.task_name}">`).join('');

    // Check for running timer
    const running = timeEntries.find(e => e.employee_email.toLowerCase() === userEmail.toLowerCase() && !e.end_time);
    if (running) {
      runningEntry = running;
      showRunningState();
    } else {
      showStartState();
    }
  } catch (err) {
    showError(`Error connecting to Google API: ${err.message}`);
    $('googleSigninForm').style.display = 'block';
  }
}

async function fetchUserProfile(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to load Google profile.');
  return await res.json();
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

  updateTimerText();
  timerInterval = setInterval(updateTimerText, 1000);
}

// ---------- BUTTON HANDLERS ----------
$('googleSigninBtn').addEventListener('click', async () => {
  try {
    authToken = await GoogleAPI.getAuthToken(true);
    await loginWithToken(authToken);
  } catch (err) {
    alert(`Sign-in failed: ${err.message}`);
  }
});

$('startBtn').addEventListener('click', async () => {
  const projectId = $('projectSelect').value;
  const task = $('taskInput').value.trim();
  if (!projectId) { alert('No project is selected.'); return; }
  if (!task) { alert('Enter or pick a task description.'); return; }

  $('startBtn').disabled = true;
  $('startBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg> Starting...`;

  try {
    const selectedProj = activeProjects.find(p => p.project_id === projectId);
    const entryId = Math.random().toString(36).substring(2, 10);
    
    const newRow = {
      entry_id: entryId,
      employee_email: userEmail,
      project_id: projectId,
      project_name: selectedProj ? selectedProj.project_name : '',
      department: currentEmployee.department,
      task_description: task,
      start_time: new Date().toISOString(),
      end_time: '',
      duration_minutes: ''
    };

    await GoogleAPI.appendRow(spreadsheetId, authToken, 'TimeEntries', HEADERS.TimeEntries, newRow);
    
    // Fetch newly written rows to capture row number
    const updatedEntries = await GoogleAPI.listAll(spreadsheetId, authToken, 'TimeEntries');
    const foundEntry = updatedEntries.find(e => e.entry_id === entryId);
    
    runningEntry = foundEntry || newRow;
    showRunningState();
    
    // Set background alarm check
    chrome.storage.local.set({
      runningTimer: { entry_id: runningEntry.entry_id, started_at: Date.now() }
    });
    chrome.alarms.create('staleTimerCheck', { periodInMinutes: 30 });
  } catch (e) {
    alert(`Could not start timer: ${e.message}`);
  } finally {
    $('startBtn').disabled = false;
    $('startBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Timer`;
  }
});

$('stopBtn').addEventListener('click', async () => {
  if (!runningEntry) return;

  $('stopBtn').disabled = true;
  $('stopBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg> Stopping...`;

  try {
    const startTime = new Date(runningEntry.start_time);
    const endTime = new Date();
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    const updatedRow = {
      ...runningEntry,
      end_time: endTime.toISOString(),
      duration_minutes: durationMinutes
    };

    // Use stored spreadsheet row number directly
    await GoogleAPI.updateRow(spreadsheetId, authToken, 'TimeEntries', HEADERS.TimeEntries, runningEntry._rowNum, updatedRow);

    runningEntry = null;
    chrome.storage.local.remove('runningTimer');
    chrome.alarms.clear('staleTimerCheck');
    $('taskInput').value = '';
    showStartState();
  } catch (e) {
    alert(`Could not stop timer: ${e.message}`);
  } finally {
    $('stopBtn').disabled = false;
    $('stopBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect></svg> Stop Timer`;
  }
});

// Spin keyframe injector
const spinStyle = document.createElement('style');
spinStyle.textContent = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
document.head.appendChild(spinStyle);

$('adminLink').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('admin.html') });
});

$('guideLink').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('guide.html') });
});

$('logoutLink').addEventListener('click', async () => {
  if (confirm('Are you sure you want to sign out?')) {
    try {
      // Revoke OAuth token so user can switch Google accounts
      await new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token: authToken }, () => {
          resolve();
        });
      });
      authToken = null;
      spreadsheetId = null;
      userEmail = null;
      window.location.reload();
    } catch (err) {
      window.location.reload();
    }
  }
});

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
    const entries = await GoogleAPI.listAll(spreadsheetId, authToken, 'TimeEntries');
    
    // Filter completed entries for this employee
    const completed = entries.filter(e => e.employee_email.toLowerCase() === userEmail.toLowerCase() && e.end_time);
    
    // Sort descending by start time to find latest
    completed.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    
    // Calculate stats
    const stats = calculateStats(completed);
    $('weekHours').textContent = `${stats.week_hours}h`;
    $('monthHours').textContent = `${stats.month_hours}h`;
    
    dashboardEntries = completed;
    
    $('dashboardLoading').style.display = 'none';
    $('entriesList').style.display = 'flex';
    
    renderDashboardEntries();
  } catch (err) {
    $('dashboardLoading').textContent = `Failed to load logs: ${err.message}`;
  }
}

function calculateStats(entries) {
  const now = new Date();
  
  // Start of current week (Monday)
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - (day === 0 ? 6 : day - 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);
  
  // Start of current month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  let weekMinutes = 0;
  let monthMinutes = 0;
  
  entries.forEach(e => {
    if (!e.start_time) return;
    const startTime = new Date(e.start_time);
    if (isNaN(startTime.getTime())) return;
    const duration = Number(e.duration_minutes) || 0;
    
    if (startTime >= startOfWeek) {
      weekMinutes += duration;
    }
    if (startTime >= startOfMonth) {
      monthMinutes += duration;
    }
  });
  
  return {
    week_hours: (weekMinutes / 60).toFixed(2),
    month_hours: (monthMinutes / 60).toFixed(2)
  };
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
  
  // Find IDs of the 4 most recent completed entries (chronologically latest)
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
    
    // Format Duration
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
  
  // Cache original info in dataset
  $('editEntryModal').dataset.originalMinutes = origMins;
  $('editEntryModal').dataset.rowNum = entry._rowNum;
  $('editEntryModal').dataset.startTime = entry.start_time;
  
  $('editEntryModal').style.display = 'flex';
}

$('cancelEditBtn').addEventListener('click', () => {
  $('editEntryModal').style.display = 'none';
  editingEntryId = null;
});

// Save edits handler
$('saveEditBtn').addEventListener('click', async () => {
  if (!editingEntryId) return;
  
  $('editError').style.display = 'none';
  
  const originalMinutes = Number($('editEntryModal').dataset.originalMinutes) || 0;
  const rowNum = Number($('editEntryModal').dataset.rowNum);
  const startTimeStr = $('editEntryModal').dataset.startTime;
  
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
    $('editEntryModal').style.display = 'none';
    editingEntryId = null;
    return;
  }
  
  $('saveEditBtn').disabled = true;
  const originalBtnText = $('saveEditBtn').innerHTML;
  $('saveEditBtn').innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite; margin-right: 4px;"><circle cx="12" cy="12" r="10"></circle></svg> Saving...`;
  
  try {
    // Recalculate end time
    const startTime = new Date(startTimeStr);
    const newEndTime = new Date(startTime.getTime() + newMinutes * 60000);
    
    // Find the current full row details to rewrite
    const currentList = await GoogleAPI.listAll(spreadsheetId, authToken, 'TimeEntries');
    const matched = currentList.find(e => e.entry_id === editingEntryId);
    
    if (!matched) throw new Error('Time entry row not found.');
    
    const updatedRow = {
      ...matched,
      end_time: newEndTime.toISOString(),
      duration_minutes: newMinutes
    };
    
    await GoogleAPI.updateRow(spreadsheetId, authToken, 'TimeEntries', HEADERS.TimeEntries, rowNum, updatedRow);
    
    $('editEntryModal').style.display = 'none';
    editingEntryId = null;
    await loadDashboard();
  } catch (err) {
    showEditError(`Error updating duration: ${err.message}`);
  } finally {
    $('saveEditBtn').disabled = false;
    $('saveEditBtn').innerHTML = originalBtnText;
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

init();
