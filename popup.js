let backendType = null;
let supabaseUrl = null;
let supabaseAnonKey = null;
let supabaseToken = null;

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

// ---------- INITIALIZATION ROUTER ----------
async function init() {
  await initTheme();
  $('loadingState').style.display = 'block';
  $('loadingState').textContent = 'Loading configurations...';
  $('loginError').style.display = 'none';
  $('setupView').style.display = 'none';
  $('googleSigninForm').style.display = 'none';
  $('supabaseSigninForm').style.display = 'none';
  $('supabaseSignupForm').style.display = 'none';
  $('mainView').style.display = 'none';

  // Read stored database configuration
  const stored = await chrome.storage.local.get([
    'backend_type', 
    'supabase_url', 
    'supabase_anon_key', 
    'supabase_token', 
    'supabase_user_email'
  ]);

  backendType = stored.backend_type;

  // FALLBACK TO PRE-CONFIGURED DEFAULTS IN config.js IF STORAGE IS EMPTY
  if (!backendType && typeof DEFAULT_BACKEND !== 'undefined' && DEFAULT_BACKEND) {
    backendType = DEFAULT_BACKEND;
    await chrome.storage.local.set({
      backend_type: DEFAULT_BACKEND,
      supabase_url: DEFAULT_SUPABASE_URL || '',
      supabase_anon_key: DEFAULT_SUPABASE_ANON_KEY || ''
    });
    stored.supabase_url = DEFAULT_SUPABASE_URL || '';
    stored.supabase_anon_key = DEFAULT_SUPABASE_ANON_KEY || '';
  }

  if (!backendType) {
    showUnifiedLogin(null);
    return;
  }

  if (backendType === 'sheets') {
    // Run Google Sheets auth flow
    $('sheetLink').style.display = 'inline-block';
    try {
      const token = await GoogleAPI.getAuthToken(false);
      if (token) {
        authToken = token;
        await loginWithSheets(token);
      } else {
        showUnifiedLogin('sheets');
      }
    } catch (err) {
      showUnifiedLogin('sheets');
    }
  } else if (backendType === 'supabase') {
    // Run Supabase auth flow
    $('sheetLink').style.display = 'none'; // No sheet link in Supabase mode
    supabaseUrl = stored.supabase_url;
    supabaseAnonKey = stored.supabase_anon_key;
    supabaseToken = stored.supabase_token;
    userEmail = stored.supabase_user_email;

    if (supabaseToken && userEmail) {
      await loginWithSupabase(supabaseToken, userEmail);
    } else {
      showUnifiedLogin('supabase');
    }
  }
}

function showUnifiedLogin(type) {
  $('loadingState').style.display = 'none';
  $('setupView').style.display = 'none';
  $('supabaseSignupForm').style.display = 'none';
  $('unifiedAuthView').style.display = 'block';

  const inviteWrapper = $('unifiedInviteCodeWrapper');
  const googleBtn = $('unifiedGoogleBtn');
  const supabaseForm = $('unifiedSupabaseForm');

  // Reset inputs
  $('unifiedEmail').value = '';
  $('unifiedPassword').value = '';
  $('unifiedInviteInput').value = '';

  if (type === 'sheets') {
    googleBtn.style.display = 'flex';
    supabaseForm.style.display = 'none';
  } else if (type === 'supabase') {
    googleBtn.style.display = 'none';
    supabaseForm.style.display = 'block';
    inviteWrapper.style.display = 'none'; // already configured keys!
  } else {
    // Fresh install, show everything
    googleBtn.style.display = 'flex';
    supabaseForm.style.display = 'block';
    inviteWrapper.style.display = 'block'; // need invite code!
  }
}

// ---------- GOOGLE SHEETS LOGIN ----------
async function loginWithSheets(token) {
  $('loadingState').style.display = 'block';
  $('loadingState').textContent = 'Connecting to Google Drive...';
  $('googleSigninForm').style.display = 'none';

  try {
    const profile = await fetchUserProfile(token);
    userEmail = profile.email;

    spreadsheetId = await GoogleAPI.findSpreadsheet(token);
    if (!spreadsheetId) {
      $('loadingState').textContent = 'Creating Clockroach spreadsheet...';
      spreadsheetId = await GoogleAPI.createSpreadsheet(token, userEmail);
    }

    $('loadingState').textContent = 'Verifying employee status...';
    const employees = await GoogleAPI.listAll(spreadsheetId, token, 'Employees');
    const emp = employees.find(e => e.email.toLowerCase() === userEmail.toLowerCase() && (e.active === 'TRUE' || e.active === true));

    if (!emp) {
      showError(`Access Denied: No active employee record found for ${userEmail}. Contact your sheet admin.`);
      $('googleSigninForm').style.display = 'block';
      return;
    }

    currentEmployee = emp;
    await finishLoginSetup();
  } catch (err) {
    showError(`Google Connection Error: ${err.message}`);
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

// ---------- SUPABASE LOGIN ----------
async function loginWithSupabase(token, email) {
  $('loadingState').style.display = 'block';
  $('loadingState').textContent = 'Connecting to Supabase...';
  $('supabaseSigninForm').style.display = 'none';
  $('supabaseSignupForm').style.display = 'none';

  try {
    const employees = await SupabaseAPI.listAll(supabaseUrl, supabaseAnonKey, token, 'employees');
    const emp = employees.find(e => e.email.toLowerCase() === email.toLowerCase() && e.active === true);

    if (!emp) {
      // Clear token to force fresh login if employee was deactivated
      await chrome.storage.local.remove(['supabase_token', 'supabase_user_email']);
      showError(`Access Denied: No active employee record found for ${email}.`);
      $('supabaseSigninForm').style.display = 'block';
      return;
    }

    currentEmployee = emp;
    await finishLoginSetup();
  } catch (err) {
    // If token has expired, prompt to sign in again
    await chrome.storage.local.remove(['supabase_token', 'supabase_user_email']);
    showError(`Session expired or connection failed: ${err.message}`);
    $('supabaseSigninForm').style.display = 'block';
  }
}

// ---------- POST-LOGIN DATA PREPARATION ----------
async function finishLoginSetup() {
  $('greeting').textContent = `Hi, ${currentEmployee.name}`;
  $('greeting').style.display = 'block';
  $('loadingState').style.display = 'none';
  $('mainView').style.display = 'block';
  $('resetBackendBtn').style.display = 'block';
  $('guideLink').style.display = 'inline-block';

  if (currentEmployee.role === 'admin') {
    $('adminLink').style.display = 'block';
  } else {
    $('adminLink').style.display = 'none';
  }

  // View reset
  $('trackerView').style.display = 'block';
  $('dashboardView').style.display = 'none';
  $('tabTracker').classList.add('active');
  $('tabDashboard').classList.remove('active');
  $('editEntryModal').style.display = 'none';

  // Fetch lists
  let projects = [];
  let tasks = [];
  let timeEntries = [];

  if (backendType === 'sheets') {
    [projects, tasks, timeEntries] = await Promise.all([
      GoogleAPI.listAll(spreadsheetId, authToken, 'Projects'),
      GoogleAPI.listAll(spreadsheetId, authToken, 'TaskPresets'),
      GoogleAPI.listAll(spreadsheetId, authToken, 'TimeEntries')
    ]);
  } else if (backendType === 'supabase') {
    [projects, tasks, timeEntries] = await Promise.all([
      SupabaseAPI.listAll(supabaseUrl, supabaseAnonKey, supabaseToken, 'projects'),
      SupabaseAPI.listAll(supabaseUrl, supabaseAnonKey, supabaseToken, 'task_presets'),
      SupabaseAPI.listAll(supabaseUrl, supabaseAnonKey, supabaseToken, 'time_entries')
    ]);
  }

  // Filter projects by department
  activeProjects = projects.filter(p => {
    const isActive = String(p.active) === 'TRUE' || p.active === true;
    if (!isActive) return false;
    if (!p.department) return true; // global
    const depts = String(p.department).split(',').map(d => d.trim().toLowerCase());
    return depts.includes(currentEmployee.department.toLowerCase());
  });

  const select = $('projectSelect');
  let selectHtml = '<option value="none">-- No Project --</option>';
  if (activeProjects.length > 0) {
    selectHtml += activeProjects.map(p => `<option value="${p.project_id}">${p.project_name}</option>`).join('');
  }
  select.innerHTML = selectHtml;

  // Filter tasks presets
  const deptTasks = tasks.filter(t => {
    const isActive = String(t.active) === 'TRUE' || t.active === true;
    return isActive && t.department === currentEmployee.department;
  });
  $('taskSuggestions').innerHTML = deptTasks.map(t => `<option value="${t.task_name}">`).join('');

  // Check running timer
  const running = timeEntries.find(e => e.employee_email.toLowerCase() === userEmail.toLowerCase() && !e.end_time);
  if (running) {
    runningEntry = running;
    showRunningState();
  } else {
    showStartState();
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

  updateTimerText();
  timerInterval = setInterval(updateTimerText, 1000);
}

// ---------- WELCOME VIEW / ROLE SELECTOR HANDLERS ----------
let supaMode = 'signup'; // 'signin' or 'signup'

$('goSignInBtn').addEventListener('click', () => {
  $('roleSelectionScreen').style.display = 'none';
  $('signInPanel').style.display = 'block';
});

$('goSignUpBtn').addEventListener('click', () => {
  $('roleSelectionScreen').style.display = 'none';
  $('signUpPanel').style.display = 'block';
});

// ---------- UNIFIED AUTH EVENT LISTENERS ----------

// Trigger Google Sheets login
$('unifiedGoogleBtn').addEventListener('click', async () => {
  $('unifiedGoogleBtn').disabled = true;
  const originalHtml = $('unifiedGoogleBtn').innerHTML;
  $('unifiedGoogleBtn').textContent = 'Connecting to Google...';
  try {
    await chrome.storage.local.set({ backend_type: 'sheets' });
    backendType = 'sheets';
    
    // Attempt Google Sheets authorization
    const token = await GoogleAPI.getAuthToken(true);
    authToken = token;
    
    // Hide auth view
    $('unifiedAuthView').style.display = 'none';
    $('loadingState').style.display = 'block';
    await loginWithSheets(token);
  } catch (err) {
    alert(`Google Sign-In failed: ${err.message}`);
    await chrome.storage.local.remove('backend_type');
    backendType = null;
  } finally {
    $('unifiedGoogleBtn').disabled = false;
    $('unifiedGoogleBtn').innerHTML = originalHtml;
  }
});

// Helper: Decode and save workspace connection code
async function connectToWorkspace(code) {
  let connectionData;
  try {
    connectionData = JSON.parse(atob(code));
  } catch (e) {
    throw new Error('Invalid invitation code format. Please check the code.');
  }

  const url = connectionData.url;
  const key = connectionData.key;

  if (!url || !key) {
    throw new Error('Invitation code is missing required connection fields.');
  }

  // Verify connection by hitting the Auth endpoint
  const testRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: 'test-connection@clockroach.com', password: 'password123' })
  });

  if (testRes.status === 400 || testRes.ok) {
    await chrome.storage.local.set({
      backend_type: 'supabase',
      supabase_url: url,
      supabase_anon_key: key
    });
    
    backendType = 'supabase';
    supabaseUrl = url;
    supabaseAnonKey = key;
  } else {
    throw new Error('Workspace verification failed. Invalid invitation code.');
  }
}

// Trigger Supabase Login
$('unifiedSubmitBtn').addEventListener('click', async () => {
  const email = $('unifiedEmail').value.trim();
  const password = $('unifiedPassword').value.trim();

  if (!email || !password) {
    alert('Enter both email and password.');
    return;
  }

  $('unifiedSubmitBtn').disabled = true;
  $('unifiedSubmitBtn').textContent = 'Signing in...';

  try {
    // If database is not configured yet, resolve the invite code first
    if (!backendType) {
      const code = $('unifiedInviteInput').value.trim();
      if (!code) {
        throw new Error('First time logging in? Please enter the Workspace Invitation Code.');
      }
      await connectToWorkspace(code);
    }

    const data = await SupabaseAPI.signIn(supabaseUrl, supabaseAnonKey, email, password);
    const token = data.access_token;

    await chrome.storage.local.set({
      supabase_token: token,
      supabase_user_email: email
    });

    supabaseToken = token;
    userEmail = email;

    $('unifiedAuthView').style.display = 'none';
    $('loadingState').style.display = 'block';
    await loginWithSupabase(token, email);
  } catch (err) {
    alert(`Login failed: ${err.message}`);
  } finally {
    $('unifiedSubmitBtn').disabled = false;
    $('unifiedSubmitBtn').textContent = 'Sign In';
  }
});

// Trigger Supabase Signup (Registration)
$('supaSignupBtn').addEventListener('click', async () => {
  const name = $('supaRegName').value.trim();
  const email = $('supaRegEmail').value.trim();
  const password = $('supaRegPassword').value.trim();
  const department = $('supaRegDept').value;

  if (!name || !email || !password) {
    alert('Please fill out all fields.');
    return;
  }

  if (password.length < 6) {
    alert('Password must be at least 6 characters.');
    return;
  }

  $('supaSignupBtn').disabled = true;
  $('supaSignupBtn').textContent = 'Registering...';

  try {
    // If database is not configured yet, resolve invite code first
    if (!backendType) {
      const code = $('unifiedRegInviteInput').value.trim();
      if (!code) {
        throw new Error('Please enter the Workspace Invitation Code to register.');
      }
      await connectToWorkspace(code);
    }

    const data = await SupabaseAPI.signUp(supabaseUrl, supabaseAnonKey, email, password, name, department);
    
    await chrome.storage.local.set({
      supabase_token: data.token,
      supabase_user_email: email
    });

    supabaseToken = data.token;
    userEmail = email;

    $('supabaseSignupForm').style.display = 'none';
    $('loadingState').style.display = 'block';
    await loginWithSupabase(data.token, email);
  } catch (err) {
    alert(`Registration failed: ${err.message}`);
  } finally {
    $('supaSignupBtn').disabled = false;
    $('supaSignupBtn').textContent = 'Register & Sign In';
  }
});

// Navigation links
$('unifiedToRegisterLink').addEventListener('click', () => {
  $('unifiedAuthView').style.display = 'none';
  $('supabaseSignupForm').style.display = 'block';

  // Toggle workspace code visibility during registration
  if (!backendType) {
    $('unifiedRegInviteCodeWrapper').style.display = 'block';
  } else {
    $('unifiedRegInviteCodeWrapper').style.display = 'none';
  }
});

$('linkToSignin').addEventListener('click', () => {
  $('supabaseSignupForm').style.display = 'none';
  $('unifiedAuthView').style.display = 'block';
});

// Manager configuration links
$('unifiedToSetupLink').addEventListener('click', () => {
  $('unifiedAuthView').style.display = 'none';
  $('setupView').style.display = 'block';
  $('signUpPanel').style.display = 'block';
  $('supabaseConfigForm').style.display = 'none';
});

document.querySelectorAll('.back-to-roles').forEach(btn => {
  btn.addEventListener('click', () => {
    $('setupView').style.display = 'none';
    $('unifiedAuthView').style.display = 'block';
  });
});

$('selectSheetsBtn').addEventListener('click', async () => {
  await chrome.storage.local.set({ backend_type: 'sheets' });
  init();
});

$('selectSupabaseBtn').addEventListener('click', () => {
  $('signUpPanel').style.display = 'none';
  $('supabaseConfigForm').style.display = 'block';
});

$('backToSignUpPanel').addEventListener('click', () => {
  $('supabaseConfigForm').style.display = 'none';
  $('signUpPanel').style.display = 'block';
});

// Save configuration (Admin only)
$('saveSupaConfigBtn').addEventListener('click', async () => {
  const url = $('setupSupaUrl').value.trim();
  const key = $('setupSupaKey').value.trim();

  if (!url || !key) {
    alert('Please enter both Supabase URL and Anon Key.');
    return;
  }

  $('saveSupaConfigBtn').disabled = true;
  $('saveSupaConfigBtn').textContent = 'Connecting...';

  try {
    // Verify connection URL and key by hitting the Auth endpoint
    const testRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: 'test-connection@clockroach.com', password: 'password123' })
    });

    if (testRes.status === 400 || testRes.ok) {
      await chrome.storage.local.set({
        backend_type: 'supabase',
        supabase_url: url,
        supabase_anon_key: key
      });
      
      backendType = 'supabase';
      supabaseUrl = url;
      supabaseAnonKey = key;

      $('setupView').style.display = 'none';
      $('supabaseSignupForm').style.display = 'block';
      $('unifiedRegInviteCodeWrapper').style.display = 'none'; // already set!
    } else {
      throw new Error('Supabase authorization failed. Verify your URL and Anon Key.');
    }
  } catch (err) {
    alert(`Connection failed: ${err.message}`);
  } finally {
    $('saveSupaConfigBtn').disabled = false;
    $('saveSupaConfigBtn').textContent = 'Connect & Proceed';
  }
});

$('resetBackendBtn').addEventListener('click', async () => {
  if (confirm('Are you sure you want to reset your database backend configuration? This will sign you out.')) {
    await chrome.storage.local.remove([
      'backend_type',
      'supabase_url',
      'supabase_anon_key',
      'supabase_token',
      'supabase_user_email'
    ]);
    window.location.reload();
  }
});

// ---------- TIMER ACTION HANDLERS ----------
$('startBtn').addEventListener('click', async () => {
  const projectId = $('projectSelect').value;
  const task = $('taskInput').value.trim();
  if (!projectId || projectId === '') { alert('No project selected.'); return; }
  if (!task) { alert('Enter task description.'); return; }

  $('startBtn').disabled = true;
  $('startBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle></svg> Starting...`;

  try {
    const selectedProj = activeProjects.find(p => p.project_id === projectId);
    const entryId = Math.random().toString(36).substring(2, 10);
    
    const newRow = {
      entry_id: entryId,
      employee_email: userEmail,
      project_id: projectId || 'none',
      project_name: selectedProj ? selectedProj.project_name : 'No Project',
      department: currentEmployee.department,
      task_description: task,
      start_time: new Date().toISOString(),
      end_time: null,
      duration_minutes: null
    };

    if (backendType === 'sheets') {
      await GoogleAPI.appendRow(spreadsheetId, authToken, 'TimeEntries', HEADERS.TimeEntries, newRow);
      // Fetch rowNum
      const updated = await GoogleAPI.listAll(spreadsheetId, authToken, 'TimeEntries');
      runningEntry = updated.find(e => e.entry_id === entryId) || newRow;
    } else if (backendType === 'supabase') {
      const res = await SupabaseAPI.insertRow(supabaseUrl, supabaseAnonKey, supabaseToken, 'time_entries', newRow);
      runningEntry = res[0] || newRow;
    }

    showRunningState();

    // Cache running state in storage for extension background warning alarm
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

    if (backendType === 'sheets') {
      await GoogleAPI.updateRow(spreadsheetId, authToken, 'TimeEntries', HEADERS.TimeEntries, runningEntry._rowNum, updatedRow);
    } else if (backendType === 'supabase') {
      await SupabaseAPI.updateRow(supabaseUrl, supabaseAnonKey, supabaseToken, 'time_entries', 'entry_id', runningEntry.entry_id, {
        end_time: endTime.toISOString(),
        duration_minutes: durationMinutes
      });
    }

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

// Tab Switch
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

// ---------- DASHBOARD LOGS ----------
async function loadDashboard() {
  if (!currentEmployee) return;

  $('dashboardLoading').style.display = 'block';
  $('entriesList').style.display = 'none';
  $('editEntryModal').style.display = 'none';

  try {
    let entries = [];
    if (backendType === 'sheets') {
      entries = await GoogleAPI.listAll(spreadsheetId, authToken, 'TimeEntries');
    } else if (backendType === 'supabase') {
      entries = await SupabaseAPI.listAll(supabaseUrl, supabaseAnonKey, supabaseToken, 'time_entries');
    }

    // Filter completed logs for employee
    const completed = entries.filter(e => e.employee_email.toLowerCase() === userEmail.toLowerCase() && e.end_time);
    completed.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

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
  
  // Monday start
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - (day === 0 ? 6 : day - 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);
  
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

function renderDashboardEntries() {
  const container = $('entriesList');
  container.innerHTML = '';
  
  if (dashboardEntries.length === 0) {
    container.innerHTML = '<div class="status" style="margin-top: 20px;">No completed logs.</div>';
    return;
  }

  const sorted = [...dashboardEntries].sort((a, b) => {
    const dateA = new Date(a.start_time);
    const dateB = new Date(b.start_time);
    return currentSortDirection === 'desc' ? dateB - dateA : dateA - dateB;
  });

  const latest4Ids = [...dashboardEntries]
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .slice(0, 4)
    .map(e => e.entry_id);

  sorted.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'entry-item';
    const isEditable = latest4Ids.includes(entry.entry_id);

    const startDate = new Date(entry.start_time);
    const dateStr = startDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const startTimeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTimeStr = entry.end_time ? new Date(entry.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Running';

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
      item.querySelector('.entry-edit-btn').addEventListener('click', () => openEditModal(entry));
    }

    container.appendChild(item);
  });
}

$('sortBtn').addEventListener('click', () => {
  currentSortDirection = currentSortDirection === 'desc' ? 'asc' : 'desc';
  $('sortDirectionText').textContent = currentSortDirection === 'desc' ? 'Newest' : 'Oldest';
  
  const svg = $('sortBtn').querySelector('svg');
  svg.style.transform = currentSortDirection === 'desc' ? 'none' : 'rotate(180deg)';
  
  renderDashboardEntries();
});

// ---------- LOG EDITING MODAL ----------
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

  $('editEntryModal').dataset.originalMinutes = origMins;
  $('editEntryModal').dataset.rowNum = entry._rowNum || '';
  $('editEntryModal').dataset.startTime = entry.start_time;

  $('editEntryModal').style.display = 'flex';
}

$('cancelEditBtn').addEventListener('click', () => {
  $('editEntryModal').style.display = 'none';
  editingEntryId = null;
});

$('saveEditBtn').addEventListener('click', async () => {
  if (!editingEntryId) return;
  $('editError').style.display = 'none';

  const originalMinutes = Number($('editEntryModal').dataset.originalMinutes) || 0;
  const rowNum = $('editEntryModal').dataset.rowNum;
  const startTimeStr = $('editEntryModal').dataset.startTime;

  const newHours = parseInt($('editHoursInput').value || 0, 10);
  const newMinutesVal = parseInt($('editMinutesInput').value || 0, 10);

  if (isNaN(newHours) || newHours < 0 || isNaN(newMinutesVal) || newMinutesVal < 0 || newMinutesVal > 59) {
    showEditError('Enter valid hours and minutes (0-59).');
    return;
  }

  const newMinutes = newHours * 60 + newMinutesVal;

  if (newMinutes > originalMinutes) {
    const origH = Math.floor(originalMinutes / 60);
    const origM = originalMinutes % 60;
    showEditError(`Duration cannot exceed original of ${origH}h ${origM}m.`);
    return;
  }

  if (newMinutes === originalMinutes) {
    $('editEntryModal').style.display = 'none';
    editingEntryId = null;
    return;
  }

  $('saveEditBtn').disabled = true;
  const origBtnText = $('saveEditBtn').innerHTML;
  $('saveEditBtn').innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite; margin-right: 4px;"><circle cx="12" cy="12" r="10"></circle></svg> Saving...`;

  try {
    const startTime = new Date(startTimeStr);
    const newEndTime = new Date(startTime.getTime() + newMinutes * 60000);

    if (backendType === 'sheets') {
      const currentList = await GoogleAPI.listAll(spreadsheetId, authToken, 'TimeEntries');
      const matched = currentList.find(e => e.entry_id === editingEntryId);
      if (!matched) throw new Error('Row not found.');

      const updatedRow = {
        ...matched,
        end_time: newEndTime.toISOString(),
        duration_minutes: newMinutes
      };
      await GoogleAPI.updateRow(spreadsheetId, authToken, 'TimeEntries', HEADERS.TimeEntries, Number(rowNum), updatedRow);
    } else if (backendType === 'supabase') {
      await SupabaseAPI.updateRow(supabaseUrl, supabaseAnonKey, supabaseToken, 'time_entries', 'entry_id', editingEntryId, {
        end_time: newEndTime.toISOString(),
        duration_minutes: newMinutes
      });
    }

    $('editEntryModal').style.display = 'none';
    editingEntryId = null;
    await loadDashboard();
  } catch (err) {
    showEditError(`Update failed: ${err.message}`);
  } finally {
    $('saveEditBtn').disabled = false;
    $('saveEditBtn').innerHTML = origBtnText;
  }
});

function showEditError(msg) {
  $('editError').textContent = msg;
  $('editError').style.display = 'block';
}

// ---------- LOGOUT & OTHER BINDINGS ----------
$('adminLink').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('admin.html') });
});

$('guideLink').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('guide.html') });
});

$('logoutLink').addEventListener('click', async () => {
  if (confirm('Are you sure you want to sign out?')) {
    try {
      if (backendType === 'sheets') {
        await new Promise((resolve) => {
          chrome.identity.removeCachedAuthToken({ token: authToken }, () => resolve());
        });
      } else if (backendType === 'supabase') {
        await chrome.storage.local.remove(['supabase_token', 'supabase_user_email']);
      }
      window.location.reload();
    } catch (err) {
      window.location.reload();
    }
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const spinStyle = document.createElement('style');
spinStyle.textContent = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
document.head.appendChild(spinStyle);

init();
