let backendType = null;
let supabaseUrl = null;
let supabaseAnonKey = null;
let supabaseToken = null;

let authToken = null;
let spreadsheetId = null;
let userEmail = null;
let currentEmployee = null;
let currentReportEntries = [];
let sortField = 'date';
let sortAscending = false;

const $ = id => document.getElementById(id);

const isSheetValueActive = val => {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === 'active' || s === '1';
};

const HEADERS = {
  Employees: ['employee_id', 'email', 'name', 'department', 'role', 'active'],
  Departments: ['department_id', 'department_name', 'parent_department'],
  Projects: ['project_id', 'project_name', 'department', 'active'],
  TaskPresets: ['task_id', 'task_name', 'department', 'active'],
  TimeEntries: ['entry_id', 'employee_email', 'project_id', 'project_name', 'department', 'task_description', 'start_time', 'end_time', 'duration_minutes'],
  CompanySettings: ['setting_key', 'setting_value']
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

// ---------- DYNAMIC DATABASE ROUTER HELPERS ----------

function getTableName(sheetName) {
  if (backendType === 'sheets') return sheetName;
  const mapping = {
    'Departments': 'departments',
    'Employees': 'employees',
    'Projects': 'projects',
    'TaskPresets': 'task_presets',
    'TimeEntries': 'time_entries',
    'CompanySettings': 'company_settings'
  };
  return mapping[sheetName];
}

async function dbListAll(sheetName, queryParams = '') {
  if (backendType === 'sheets') {
    return await GoogleAPI.listAll(spreadsheetId, authToken, sheetName);
  } else {
    const tableName = getTableName(sheetName);
    return await SupabaseAPI.listAll(supabaseUrl, supabaseAnonKey, supabaseToken, tableName, queryParams);
  }
}

async function dbInsert(sheetName, rowObj) {
  if (backendType === 'sheets') {
    return await GoogleAPI.appendRow(spreadsheetId, authToken, sheetName, HEADERS[sheetName], rowObj);
  } else {
    const tableName = getTableName(sheetName);
    const cleanData = { ...rowObj };
    delete cleanData._rowNum;
    return await SupabaseAPI.insertRow(supabaseUrl, supabaseAnonKey, supabaseToken, tableName, cleanData);
  }
}

async function dbUpdate(sheetName, queryCol, queryVal, rowNum, rowObj) {
  if (backendType === 'sheets') {
    return await GoogleAPI.updateRow(spreadsheetId, authToken, sheetName, HEADERS[sheetName], rowNum, rowObj);
  } else {
    const tableName = getTableName(sheetName);
    const cleanData = { ...rowObj };
    delete cleanData._rowNum;
    return await SupabaseAPI.updateRow(supabaseUrl, supabaseAnonKey, supabaseToken, tableName, queryCol, queryVal, cleanData);
  }
}

async function dbDelete(sheetName, queryCol, queryVal, rowNum) {
  if (backendType === 'sheets') {
    return await GoogleAPI.deleteRow(spreadsheetId, authToken, sheetName, rowNum);
  } else {
    const tableName = getTableName(sheetName);
    return await SupabaseAPI.deleteRow(supabaseUrl, supabaseAnonKey, supabaseToken, tableName, queryCol, queryVal);
  }
}

// ---------- INITIALIZATION ----------
async function init() {
  await initTheme();
  
  try {
    const stored = await chrome.storage.local.get([
      'backend_type',
      'supabase_url',
      'supabase_anon_key',
      'supabase_token',
      'supabase_user_email',
      'spreadsheet_id',
      'sheets_user_email'
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
      document.body.innerHTML = `
        <div class="container" style="text-align: center; margin-top: 100px;">
          <h2>Configuration Missing</h2>
          <p>Database backend is not configured yet. Please open the Extension popup first to complete the setup.</p>
        </div>
      `;
      return;
    }

    if (backendType === 'sheets') {
      // sheets verification via Apps Script Web App
      spreadsheetId = stored.spreadsheet_id;
      userEmail = stored.sheets_user_email;
      if (!spreadsheetId || !userEmail) {
        alert('Configuration missing. Please set up the Google Sheets Web App URL in the extension popup first.');
        return;
      }
    } else if (backendType === 'supabase') {
      // supabase verification
      supabaseUrl = stored.supabase_url;
      supabaseAnonKey = stored.supabase_anon_key;
      supabaseToken = stored.supabase_token;
      userEmail = stored.supabase_user_email;

      if (!supabaseToken || !userEmail) {
        alert('Session expired. Please sign in via the extension popup first.');
        return;
      }

      // Generate and display workspace invite code
      try {
        const inviteData = { url: supabaseUrl, key: supabaseAnonKey };
        const code = btoa(JSON.stringify(inviteData));
        $('supaInviteCode').textContent = code;
        $('supaInviteContainer').style.display = 'block';

        $('copyInviteBtn').addEventListener('click', () => {
          navigator.clipboard.writeText(code);
          const btn = $('copyInviteBtn');
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy Code'; }, 2000);
        });
      } catch (err) {
        console.error('Failed to generate invite code', err);
      }
    }

    // Verify user is active admin or manager
    const employees = await dbListAll('Employees');
    const emp = employees.find(e => e.email.toLowerCase() === userEmail.toLowerCase() && isSheetValueActive(e.active));
    
    if (!emp || (emp.role !== 'admin' && emp.role !== 'manager')) {
      document.body.innerHTML = `
        <div class="container" style="text-align: center; margin-top: 100px;">
          <h2>Access Denied</h2>
          <p>You must be registered as an "admin" or a "manager" in the employees list to access this dashboard.</p>
        </div>
      `;
      return;
    }

    currentEmployee = emp;

    // Hide The Nest tab for managers
    if (currentEmployee.role !== 'admin') {
      const nestTab = document.querySelector('.tab[data-tab="nest"]');
      if (nestTab) nestTab.style.display = 'none';
    }

    // Refresh lists
    await Promise.all([
      refreshDepartments(),
      refreshEmployees(),
      refreshProjects(),
      refreshTasks()
    ]);

    // Initialize accordion item toggles inside The Nest tab
    document.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const item = header.closest('.accordion-item');
        const isActive = item.classList.contains('active');
        document.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('active'));
        if (!isActive) {
          item.classList.add('active');
        }
      });
    });

    await populateFilterDropdowns();
  } catch (err) {
    alert(`Failed to load Admin Dashboard: ${err.message}`);
  }
}



// ---------- TABS NAVIGATION ----------
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    
    t.classList.add('active');
    $(t.dataset.tab ? `tab-${t.dataset.tab}` : '').classList.add('active');
    
    if (t.dataset.tab === 'nest') {
      refreshNestTab();
    }
  });
});

// ---------- DEPARTMENTS ----------
function getDepartmentFullPath(depts, dept) {
  if (!dept.parent_department) {
    return dept.department_name;
  }
  const parent = depts.find(d => String(d.department_name).toLowerCase() === String(dept.parent_department).toLowerCase());
  if (!parent) {
    return dept.department_name;
  }
  return `${getDepartmentFullPath(depts, parent)} > ${dept.department_name}`;
}

function getRecursiveChildren(depts, deptName) {
  const children = [];
  const direct = depts.filter(d => d.parent_department && String(d.parent_department).toLowerCase() === String(deptName).toLowerCase());
  direct.forEach(child => {
    children.push(child.department_name);
    children.push(...getRecursiveChildren(depts, child.department_name));
  });
  return children;
}

async function refreshDepartments() {
  const depts = await dbListAll('Departments');
  
  // Format options with Parent - Sub layout
  const formattedDepts = depts.map(d => {
    return {
      id: d.department_id,
      name: d.department_name,
      parent: d.parent_department || '',
      displayName: getDepartmentFullPath(depts, d)
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));

  const options = formattedDepts.map(d => `<option value="${d.name}">${d.displayName}</option>`).join('');
  $('empDept').innerHTML = options;
  $('taskDept').innerHTML = options;
  
  // Also populate the parent selection dropdown inside Departments tab
  $('deptParent').innerHTML = '<option value="">-- No Parent (Root Department) --</option>' + 
    formattedDepts.map(d => `<option value="${d.name}">${d.displayName}</option>`).join('');

  const deptCheckboxes = formattedDepts.map(d => `
    <label style="display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 13px; font-weight: normal; text-transform: none;">
      <input type="checkbox" name="projDeptCheck" value="${d.name}" style="width: auto;">
      <span>${d.displayName}</span>
    </label>
  `).join('');
  $('projDeptsContainer').innerHTML = deptCheckboxes || '<span class="status">No departments available</span>';

  let filteredDepts = formattedDepts;
  if (currentEmployee && currentEmployee.role === 'manager') {
    const mgrDept = String(currentEmployee.department).toLowerCase();
    filteredDepts = formattedDepts.filter(d => d.name.toLowerCase() === mgrDept);
  }

  $('departmentsTable').querySelector('tbody').innerHTML = filteredDepts.map(d => `
    <tr>
      <td style="font-weight: 500;">${d.name}</td>
      <td>${d.parent ? `<span class="badge" style="background-color: var(--bg-tertiary);">${d.parent}</span>` : '<span style="color: var(--text-muted); font-size: 12px;">None (Root)</span>'}</td>
      <td>
        <div style="display: flex; gap: 4px; align-items: center;">
          <button class="btn-secondary btn-edit-dept" data-id="${d.id}" style="margin: 0; padding: 6px 10px; font-size: 12px;">Edit</button>
          <button class="btn-secondary btn-delete" data-id="${d.id}" style="margin: 0; padding: 6px 10px; font-size: 12px;">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

$('addDeptBtn').addEventListener('click', async () => {
  const name = $('deptName').value.trim();
  const parent = $('deptParent').value;
  if (!name) return;
  
  const newId = Math.random().toString(36).substring(2, 10);
  
  $('addDeptBtn').disabled = true;
  try {
    await dbInsert('Departments', {
      department_id: newId,
      department_name: name,
      parent_department: parent || null
    });
    $('deptName').value = '';
    $('deptParent').value = '';
    await refreshDepartments();
    await populateFilterDropdowns();
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    $('addDeptBtn').disabled = false;
  }
});

async function removeDept(id) {
  if (confirm("Are you sure you want to delete this department?")) {
    try {
      const depts = await dbListAll('Departments');
      const matched = depts.find(d => d.department_id === id);
      if (matched) {
        await dbDelete('Departments', 'department_id', id, matched._rowNum);
        await refreshDepartments();
        await populateFilterDropdowns();
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }
}

// ---------- EMPLOYEES ----------
async function refreshEmployees() {
  let emps = await dbListAll('Employees');
  if (currentEmployee && currentEmployee.role === 'manager') {
    const mgrDept = String(currentEmployee.department).toLowerCase();
    emps = emps.filter(e => String(e.department).toLowerCase() === mgrDept);
  }
  
  // Load active tracking entries (where end_time is null or blank)
  let activeEntries = [];
  try {
    if (backendType === 'supabase') {
      activeEntries = await dbListAll('TimeEntries', 'end_time=is.null');
    } else {
      const all = await dbListAll('TimeEntries');
      activeEntries = all.filter(e => !e.end_time || e.end_time === 'null' || e.end_time === '');
    }
  } catch (err) {
    console.error('Failed to load active time entries:', err);
  }

  // Calculate active and total employee counts
  const activeCount = emps.filter(e => isSheetValueActive(e.active)).length;
  
  // Count how many are currently tracking time (ignoring stale entries older than 16 hours)
  const trackingEmails = new Set();
  activeEntries.forEach(entry => {
    const start = new Date(entry.start_time);
    const diffMs = Date.now() - start;
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMins <= 16 * 60) {
      trackingEmails.add(String(entry.employee_email).toLowerCase());
    }
  });

  const trackingCount = emps.filter(e => {
    const isEmpActive = isSheetValueActive(e.active);
    return isEmpActive && trackingEmails.has(String(e.email).toLowerCase());
  }).length;

  $('registeredEmployeesTitle').textContent = `Registered Employees (Tracking: ${trackingCount} | Active: ${activeCount} / Total: ${emps.length})`;

  $('employeesTable').querySelector('tbody').innerHTML = emps.map(e => {
    const active = isSheetValueActive(e.active);
    const statusText = active ? 'Active' : 'Inactive';
    const toggleText = active ? 'Deactivate' : 'Activate';
    const statusClass = active ? 'status-active' : 'status-inactive';
    const toggleBtnClass = active ? 'btn-deactivate' : 'btn-activate';

    // Find if this employee is currently tracking
    const emailLower = String(e.email).toLowerCase();
    const trackingEntry = activeEntries.find(entry => String(entry.employee_email).toLowerCase() === emailLower);

    let activityHtml = '';
    const start = trackingEntry ? new Date(trackingEntry.start_time) : null;
    const diffMs = start ? Date.now() - start : 0;
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    const isStale = diffMins > 16 * 60; // Stale if running > 16h

    if (active && trackingEntry && !isStale) {
      let durationText = '';
      if (diffMins < 60) {
        durationText = `${diffMins}m`;
      } else {
        const hrs = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        durationText = `${hrs}h ${mins}m`;
      }
      
      activityHtml = `
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #10b981;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #10b981; animation: pulse 2s infinite;"></span>
            <span>Tracking</span>
            <span style="font-size: 11px; font-weight: 500; padding: 1px 5px; border-radius: 4px; background: rgba(16, 185, 129, 0.15);">${durationText}</span>
          </div>
          <span style="font-size: 12px; color: var(--text-secondary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <strong>${trackingEntry.project_name || 'No Project'}</strong>: ${trackingEntry.task_description || 'No task description'}
          </span>
        </div>
      `;
    } else {
      activityHtml = `
        <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--text-muted);">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: var(--text-muted); opacity: 0.6;"></span>
          <span>Offline</span>
        </div>
      `;
    }

    return `
      <tr>
        <td style="font-weight: 600; color: var(--text-primary);">${e.name}</td>
        <td>${e.email}</td>
        <td>${e.department}</td>
        <td><span class="badge" style="background-color: var(--bg-tertiary);">${e.role}</span></td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
        <td>${activityHtml}</td>
        <td style="white-space: nowrap;">
          <div style="display: flex; gap: 4px; align-items: center;">
            ${active && trackingEntry && !isStale ? `<button class="btn-secondary btn-stop-timer" data-email="${e.email}" style="margin: 0; padding: 6px 10px; font-size: 12px; border-color: var(--accent-rose); color: var(--accent-rose); background: rgba(244, 63, 94, 0.05);">Stop Timer</button>` : ''}
            <button class="btn-secondary btn-edit-emp" data-id="${e.employee_id}" style="margin: 0; padding: 6px 10px; font-size: 12px;">Edit</button>
            <button class="btn-secondary ${toggleBtnClass}" data-id="${e.employee_id}" data-active="${!active}" style="margin: 0; padding: 6px 10px; font-size: 12px;">${toggleText}</button>
            <button class="btn-secondary btn-delete" data-id="${e.employee_id}" style="margin: 0; padding: 6px 10px; font-size: 12px;">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleEmpActive(id, activeState) {
  try {
    const emps = await dbListAll('Employees');
    const matched = emps.find(e => e.employee_id === id);
    if (matched) {
      const updated = {
        ...matched,
        active: activeState
      };
      await dbUpdate('Employees', 'employee_id', id, matched._rowNum, updated);
      await refreshEmployees();
      populateFilterDropdowns();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

$('addEmpBtn').addEventListener('click', async () => {
  const email = $('empEmail').value.trim();
  const name = $('empName').value.trim();
  const dept = $('empDept').value;
  const role = $('empRole').value;
  if (!email || !name) { alert('Email and name are required.'); return; }
  
  const newId = Math.random().toString(36).substring(2, 10);
  
  $('addEmpBtn').disabled = true;
  try {
    await dbInsert('Employees', {
      employee_id: newId,
      email: email,
      name: name,
      department: dept,
      role: role,
      active: true
    });
    
    $('empEmail').value = '';
    $('empName').value = '';
    await refreshEmployees();
    populateFilterDropdowns();

    // Trigger Invitation Delivery (Only for Supabase; Sheets is fully handled on Apps Script backend)
    if (backendType === 'supabase') {
      try {
        const settings = await dbListAll('CompanySettings');
        const getSettingVal = key => (settings.find(s => s.setting_key === key) || {}).setting_value || '';
        
        const method = getSettingVal('invitation_method') || 'mailto';
        const inviteCode = $('supaInviteCode').textContent || '';
        
        if (method === 'mailto') {
          const subject = encodeURIComponent("Welcome to Clockroach - Workspace Invitation");
          const body = encodeURIComponent(
            `Hello ${name},\n\n` +
            `You have been invited to join our Clockroach workspace as a ${role}.\n\n` +
            `To get started:\n` +
            `1. Install the Clockroach Chrome Extension.\n` +
            `2. Connect using this Workspace Invite Code:\n` +
            `${inviteCode}\n\n` +
            `3. Sign up using your email: ${email}\n\n` +
            `Best regards,\n` +
            `Management`
          );
          window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        } else if (method === 'resend') {
          const apiKey = getSettingVal('resend_api_key');
          const sender = getSettingVal('resend_sender') || 'onboarding@resend.dev';
          
          if (!apiKey) {
            alert('Resend API key is not configured. Please set it up in "The Nest" tab settings.');
          } else {
            const emailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: `Clockroach Onboarding <${sender}>`,
                to: [email],
                subject: 'Welcome to Clockroach - Workspace Invitation',
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #0f172a;">Welcome to Clockroach!</h2>
                    <p>Hello <strong>${name}</strong>,</p>
                    <p>You have been invited to join our Clockroach workspace as a <strong>${role}</strong>.</p>
                    <p>To get started, follow these simple steps:</p>
                    <ol style="line-height: 1.6;">
                      <li>Install the Clockroach Chrome Extension.</li>
                      <li>When prompted, paste this Workspace Invitation Code:
                        <div style="background: #f1f5f9; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 11px; word-break: break-all; margin: 8px 0; border: 1px solid #cbd5e1;">
                          ${inviteCode}
                        </div>
                      </li>
                      <li>Sign up using your email: <strong>${email}</strong></li>
                    </ol>
                    <p style="margin-top: 24px; font-size: 13px; color: #64748b;">If you have any questions, contact your workspace administrator.</p>
                  </div>
                `
              })
            });
            if (emailRes.ok) {
              alert(`Employee added, and invitation email sent automatically to ${email} via Resend!`);
            } else {
              const errJson = await emailRes.json();
              alert(`Employee added, but failed to send automated email: ${errJson.message || 'Unknown error'}`);
            }
          }
        }
      } catch (inviteErr) {
        console.error('Failed to trigger invite delivery:', inviteErr);
        alert(`Employee registered, but failed to dispatch email: ${inviteErr.message}`);
      }
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    $('addEmpBtn').disabled = false;
  }
});

async function removeEmp(id) {
  if (confirm('Delete this employee record permanently from the database?')) {
    try {
      const emps = await dbListAll('Employees');
      const matched = emps.find(e => e.employee_id === id);
      if (matched) {
        await dbDelete('Employees', 'employee_id', id, matched._rowNum);
        await refreshEmployees();
        populateFilterDropdowns();
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }
}

// ---------- PROJECTS ----------
async function refreshProjects() {
  let projects = await dbListAll('Projects');
  if (currentEmployee && currentEmployee.role === 'manager') {
    const mgrDept = String(currentEmployee.department).toLowerCase();
    projects = projects.filter(p => {
      if (!p.department) return false;
      const depts = String(p.department).split(',').map(d => d.trim().toLowerCase());
      return depts.includes(mgrDept);
    });
  }
  $('projectsTable').querySelector('tbody').innerHTML = projects.map(p => {
    const active = isSheetValueActive(p.active);
    const statusText = active ? 'Active' : 'Inactive';
    const toggleText = active ? 'Deactivate' : 'Activate';
    const statusClass = active ? 'status-active' : 'status-inactive';
    const toggleBtnClass = active ? 'btn-deactivate' : 'btn-activate';
    return `
      <tr>
        <td style="font-weight: 600;">${p.project_name}</td>
        <td>${p.department}</td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
        <td>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="btn-secondary btn-edit-proj" data-id="${p.project_id}" style="margin: 0; padding: 6px 10px; font-size: 12px;">Edit</button>
            <button class="btn-secondary ${toggleBtnClass}" data-id="${p.project_id}" data-active="${!active}" style="margin: 0; padding: 6px 10px; font-size: 12px;">${toggleText}</button>
            <button class="btn-secondary btn-delete" data-id="${p.project_id}" style="margin: 0; padding: 6px 10px; font-size: 12px;">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleProjActive(id, activeState) {
  try {
    const projects = await dbListAll('Projects');
    const matched = projects.find(p => p.project_id === id);
    if (matched) {
      const updated = {
        ...matched,
        active: activeState
      };
      await dbUpdate('Projects', 'project_id', id, matched._rowNum, updated);
      await refreshProjects();
      populateFilterDropdowns();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

$('addProjBtn').addEventListener('click', async () => {
  const name = $('projName').value.trim();
  if (!name) return;
  
  const checkedDepts = Array.from($('projDeptsContainer').querySelectorAll('input[name="projDeptCheck"]:checked')).map(cb => cb.value);
  if (checkedDepts.length === 0) {
    alert('Please select at least one department for the project.');
    return;
  }

  const newId = Math.random().toString(36).substring(2, 10);
  
  $('addProjBtn').disabled = true;
  try {
    await dbInsert('Projects', {
      project_id: newId,
      project_name: name,
      department: checkedDepts.join(', '),
      active: true
    });
    
    $('projName').value = '';
    $('projDeptsContainer').querySelectorAll('input[name="projDeptCheck"]').forEach(cb => cb.checked = false);
    
    await refreshProjects();
    populateFilterDropdowns();
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    $('addProjBtn').disabled = false;
  }
});

async function removeProj(id) {
  if (confirm('Delete this project permanently from the database?')) {
    try {
      const projects = await dbListAll('Projects');
      const matched = projects.find(p => p.project_id === id);
      if (matched) {
        await dbDelete('Projects', 'project_id', id, matched._rowNum);
        await refreshProjects();
        populateFilterDropdowns();
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }
}

// ---------- TASK PRESETS ----------
async function refreshTasks() {
  let tasks = await dbListAll('TaskPresets');
  if (currentEmployee && currentEmployee.role === 'manager') {
    const mgrDept = String(currentEmployee.department).toLowerCase();
    tasks = tasks.filter(t => String(t.department).toLowerCase() === mgrDept);
  }
  $('tasksTable').querySelector('tbody').innerHTML = tasks.map(t => `
    <tr>
      <td>${t.task_name}</td>
      <td>${t.department}</td>
      <td>
        <div style="display: flex; gap: 4px; align-items: center;">
          <button class="btn-secondary btn-edit-task" data-id="${t.task_id}" style="margin: 0; padding: 6px 10px; font-size: 12px;">Edit</button>
          <button class="btn-secondary btn-delete" data-id="${t.task_id}" style="margin: 0; padding: 6px 10px; font-size: 12px;">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

$('addTaskBtn').addEventListener('click', async () => {
  const name = $('taskName').value.trim();
  if (!name) return;
  
  const newId = Math.random().toString(36).substring(2, 10);
  
  $('addTaskBtn').disabled = true;
  try {
    await dbInsert('TaskPresets', {
      task_id: newId,
      task_name: name,
      department: $('taskDept').value,
      active: true
    });
    $('taskName').value = '';
    await refreshTasks();
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    $('addTaskBtn').disabled = false;
  }
});

async function removeTask(id) {
  if (confirm('Delete this task preset?')) {
    try {
      const tasks = await dbListAll('TaskPresets');
      const matched = tasks.find(t => t.task_id === id);
      if (matched) {
        await dbDelete('TaskPresets', 'task_id', id, matched._rowNum);
        await refreshTasks();
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }
}

// ---------- REPORTS ----------
async function populateFilterDropdowns() {
  const emps = await dbListAll('Employees');
  $('filterEmployee').innerHTML = '<option value="">All employees</option>' +
    emps.map(e => `<option value="${e.email}">${e.name} (${e.email})</option>`).join('');

  const projects = await dbListAll('Projects');
  const dropdown = $('projectSelectDropdown');
  dropdown.innerHTML = projects.map(p => `
    <label class="multiselect-option">
      <input type="checkbox" name="filterProjectCheck" value="${p.project_id}" data-name="${p.project_name}">
      <span>${p.project_name}</span>
    </label>
  `).join('');
  $('projectSelectTrigger').textContent = 'All projects';

  const depts = await dbListAll('Departments');
  $('filterDepartment').innerHTML = '<option value="">All departments</option>' +
    depts.map(d => `<option value="${d.department_name}">${d.department_name}</option>`).join('');
}

// Multiselect togglers
$('projectSelectTrigger').addEventListener('click', (e) => {
  e.stopPropagation();
  const dropdown = $('projectSelectDropdown');
  const isHidden = dropdown.style.display === 'none';
  dropdown.style.display = isHidden ? 'block' : 'none';
});

$('projectSelectDropdown').addEventListener('click', (e) => {
  e.stopPropagation();
});

document.addEventListener('click', () => {
  $('projectSelectDropdown').style.display = 'none';
});

$('projectSelectDropdown').addEventListener('change', () => {
  const checked = Array.from($('projectSelectDropdown').querySelectorAll('input[name="filterProjectCheck"]:checked'));
  if (checked.length === 0) {
    $('projectSelectTrigger').textContent = 'All projects';
  } else if (checked.length === 1) {
    $('projectSelectTrigger').textContent = checked[0].dataset.name;
  } else {
    $('projectSelectTrigger').textContent = `${checked.length} projects selected`;
  }
});

$('runReportBtn').addEventListener('click', runReport);

async function runReport() {
  const checkedProjects = Array.from($('projectSelectDropdown').querySelectorAll('input[name="filterProjectCheck"]:checked')).map(cb => cb.value);
  const filterEmployee = $('filterEmployee').value;
  const filterDepartment = $('filterDepartment').value;
  const filterStart = $('filterStart').value;
  const filterEnd = $('filterEnd').value;
  
  $('totalHoursLabel').textContent = 'Loading Report...';
  
  try {
    const allEntries = await dbListAll('TimeEntries');
    let entries = allEntries.filter(e => e.end_time); // completed only

    if (currentEmployee && currentEmployee.role === 'manager') {
      const mgrDept = String(currentEmployee.department).toLowerCase();
      entries = entries.filter(e => String(e.department).toLowerCase() === mgrDept);
    }
    
    // 2. Apply filters client-side
    if (filterEmployee) {
      entries = entries.filter(e => e.employee_email.toLowerCase() === filterEmployee.toLowerCase());
    }
    if (checkedProjects.length > 0) {
      entries = entries.filter(e => checkedProjects.includes(e.project_id));
    }
    if (filterDepartment) {
      entries = entries.filter(e => e.department.toLowerCase() === filterDepartment.toLowerCase());
    }
    if (filterStart) {
      const start = new Date(filterStart);
      entries = entries.filter(e => new Date(e.start_time) >= start);
    }
    if (filterEnd) {
      const end = new Date(filterEnd);
      end.setHours(23, 59, 59, 999);
      entries = entries.filter(e => new Date(e.start_time) <= end);
    }
    
    currentReportEntries = entries;
    
    $('summaryCard').style.display = 'block';
    $('detailCard').style.display = 'block';
    
    if (currentReportEntries.length > 0) {
      $('exportCsvBtn').style.display = 'inline-flex';
    } else {
      $('exportCsvBtn').style.display = 'none';
    }

    const totalSeconds = currentReportEntries.reduce((sum, e) => sum + getEntryDurationSeconds(e), 0);
    $('totalHoursLabel').textContent = `Total: ${formatSecondsToHMS(totalSeconds)}`;

    // Group by employee
    const employeeSeconds = {};
    currentReportEntries.forEach(e => {
      employeeSeconds[e.employee_email] = (employeeSeconds[e.employee_email] || 0) + getEntryDurationSeconds(e);
    });

    $('byEmployeeTable').querySelector('tbody').innerHTML = Object.entries(employeeSeconds)
      .map(([email, secs]) => `<tr><td>${email}</td><td><strong>${formatSecondsToHMS(secs)}</strong></td></tr>`).join('');

    // Group by project & contributors
    const projectSeconds = {};
    const projectContributors = {};
    
    currentReportEntries.forEach(e => {
      projectSeconds[e.project_name] = (projectSeconds[e.project_name] || 0) + getEntryDurationSeconds(e);
      
      if (!projectContributors[e.project_name]) {
        projectContributors[e.project_name] = {};
      }
      projectContributors[e.project_name][e.employee_email] = 
        (projectContributors[e.project_name][e.employee_email] || 0) + getEntryDurationSeconds(e);
    });

    let projectHtml = '';
    if (Object.keys(projectSeconds).length === 0) {
      projectHtml = '<tr><td colspan="2" class="status">No projects tracked in this range.</td></tr>';
    } else {
      Object.entries(projectSeconds).forEach(([project, secs]) => {
        projectHtml += `
          <tr>
            <td style="font-weight: 600; color: var(--text-primary);">${project}</td>
            <td><strong>${formatSecondsToHMS(secs)}</strong></td>
          </tr>
        `;
        const contribs = projectContributors[project];
        if (contribs && Object.keys(contribs).length > 0) {
          projectHtml += `
            <tr class="contributor-row">
              <td colspan="2">
                <ul class="contributor-list">
          `;
          Object.entries(contribs).forEach(([email, cSecs]) => {
            projectHtml += `
              <li class="contributor-item">
                <span>${email}</span>
                <span><strong>${formatSecondsToHMS(cSecs)}</strong></span>
              </li>
            `;
          });
          projectHtml += `
                </ul>
              </td>
            </tr>
          `;
        }
      });
    }
    $('byProjectTable').querySelector('tbody').innerHTML = projectHtml;

    // Daily breakdown
    if (filterEmployee && checkedProjects.length === 1) {
      $('employeeProjectBreakdownBox').style.display = 'block';
      $('breakdownIndicator').style.display = 'inline-flex';
      
      const dailyGroup = {};
      currentReportEntries.forEach(e => {
        const dateStr = new Date(e.start_time).toLocaleDateString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric'
        });
        if (!dailyGroup[dateStr]) {
          dailyGroup[dateStr] = { seconds: 0, tasks: new Set() };
        }
        dailyGroup[dateStr].seconds += getEntryDurationSeconds(e);
        if (e.task_description) {
          dailyGroup[dateStr].tasks.add(e.task_description);
        }
      });
      
      const breakdownRows = Object.entries(dailyGroup).map(([date, data]) => `
        <tr>
          <td>${date}</td>
          <td><strong>${formatSecondsToHMS(data.seconds)}</strong></td>
          <td>${Array.from(data.tasks).join(', ') || '—'}</td>
        </tr>
      `).join('');
      
      $('employeeProjectBreakdownTable').querySelector('tbody').innerHTML = 
        breakdownRows || '<tr><td colspan="3" class="status">No recorded time matches.</td></tr>';
    } else {
      $('employeeProjectBreakdownBox').style.display = 'none';
      $('breakdownIndicator').style.display = 'none';
    }

    renderDetailTable(currentReportEntries);
  } catch (err) {
    alert(`Failed to compile report: ${err.message}`);
    $('totalHoursLabel').textContent = 'Error compiling report.';
  }
}

// ---------- SORTING ----------
function renderDetailTable(entries) {
  let sorted = [...entries];
  if (sortField) {
    sorted.sort((a, b) => {
      let valA = '', valB = '';
      if (sortField === 'employee') { valA = a.employee_email; valB = b.employee_email; }
      else if (sortField === 'project') { valA = a.project_name; valB = b.project_name; }
      else if (sortField === 'department') { valA = a.department; valB = b.department; }
      else if (sortField === 'date') { valA = new Date(a.start_time).getTime(); valB = new Date(b.start_time).getTime(); }
      else if (sortField === 'duration') { valA = getEntryDurationSeconds(a); valB = getEntryDurationSeconds(b); }
      
      if (valA < valB) return sortAscending ? -1 : 1;
      if (valA > valB) return sortAscending ? 1 : -1;
      return 0;
    });
  }
  
  const tbody = $('detailTable').querySelector('tbody');
  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="status">No detailed logs found.</td></tr>';
    return;
  }
  
  tbody.innerHTML = sorted.map(e => {
    const date = new Date(e.start_time).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const secs = getEntryDurationSeconds(e);
    return `
      <tr>
        <td style="font-weight: 500;">${e.employee_email}</td>
        <td>${e.project_name}</td>
        <td><span class="badge" style="background-color: var(--bg-secondary);">${e.department}</span></td>
        <td>${e.task_description || '—'}</td>
        <td style="color: var(--text-secondary);">${date}</td>
        <td><strong>${formatSecondsToHMS(secs)}</strong> (${Math.round(secs / 60)}m)</td>
      </tr>
    `;
  }).join('');
}

document.querySelectorAll('#detailTable th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    if (sortField === field) {
      sortAscending = !sortAscending;
    } else {
      sortField = field;
      sortAscending = true;
    }
    
    document.querySelectorAll('#detailTable th.sortable').forEach(h => {
      h.textContent = h.textContent.replace(/ ▲| ▼/g, '');
    });
    th.textContent += sortAscending ? ' ▲' : ' ▼';
    
    renderDetailTable(currentReportEntries);
  });
});

// ---------- CSV EXPORT ----------
$('exportCsvBtn').addEventListener('click', () => {
  if (currentReportEntries.length === 0) return;
  const headers = ['Entry ID', 'Employee Email', 'Project Name', 'Department', 'Task Description', 'Start Time', 'End Time', 'Duration (Seconds)', 'Duration (HH:MM:SS)'];
  const csvRows = [headers.join(',')];
  
  currentReportEntries.forEach(e => {
    const secs = getEntryDurationSeconds(e);
    const row = [
      e.entry_id,
      `"${e.employee_email.replace(/"/g, '""')}"`,
      `"${e.project_name.replace(/"/g, '""')}"`,
      `"${e.department.replace(/"/g, '""')}"`,
      `"${(e.task_description || '').replace(/"/g, '""')}"`,
      e.start_time,
      e.end_time,
      secs,
      formatSecondsToHMS(secs)
    ];
    csvRows.push(row.join(','));
  });
  
  const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `clockroach_report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// ---------- HELPERS ----------
function getEntryDurationSeconds(e) {
  if (!e.end_time) return 0;
  return Math.round((new Date(e.end_time) - new Date(e.start_time)) / 1000);
}

function formatSecondsToHMS(secs) {
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ---------- QUICK PRESETS ----------
$('quickToday').addEventListener('click', () => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  $('filterStart').value = dateStr;
  $('filterEnd').value = dateStr;
  runReport();
});

$('quickYesterday').addEventListener('click', () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);
  $('filterStart').value = dateStr;
  $('filterEnd').value = dateStr;
  runReport();
});

$('quickWeek').addEventListener('click', () => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  $('filterStart').value = start.toISOString().slice(0, 10);
  $('filterEnd').value = now.toISOString().slice(0, 10);
  runReport();
});

$('quickLastWeek').addEventListener('click', () => {
  const now = new Date();
  const day = now.getDay();
  const mondayOfThisWeek = new Date(now);
  mondayOfThisWeek.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  
  const start = new Date(mondayOfThisWeek);
  start.setDate(mondayOfThisWeek.getDate() - 7);
  
  const end = new Date(mondayOfThisWeek);
  end.setDate(mondayOfThisWeek.getDate() - 1);
  
  $('filterStart').value = start.toISOString().slice(0, 10);
  $('filterEnd').value = end.toISOString().slice(0, 10);
  runReport();
});

$('quickMonth').addEventListener('click', () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  $('filterStart').value = start.toISOString().slice(0, 10);
  $('filterEnd').value = now.toISOString().slice(0, 10);
  runReport();
});

$('quickLastMonth').addEventListener('click', () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  $('filterStart').value = start.toISOString().slice(0, 10);
  $('filterEnd').value = end.toISOString().slice(0, 10);
  runReport();
});

$('quickLast3Months').addEventListener('click', () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  $('filterStart').value = start.toISOString().slice(0, 10);
  $('filterEnd').value = now.toISOString().slice(0, 10);
  runReport();
});

// ---------- EVENT DELEGATION FOR TABLES ----------
$('departmentsTable').querySelector('tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains('btn-delete')) {
    await removeDept(id);
  } else if (btn.classList.contains('btn-edit-dept')) {
    await openEditDeptModal(id);
  }
});

$('employeesTable').querySelector('tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains('btn-delete')) {
    await removeEmp(id);
  } else if (btn.classList.contains('btn-activate') || btn.classList.contains('btn-deactivate')) {
    const activeState = btn.dataset.active === 'true';
    await toggleEmpActive(id, activeState);
  } else if (btn.classList.contains('btn-edit-emp')) {
    await openEditEmpModal(id);
  } else if (btn.classList.contains('btn-stop-timer')) {
    const email = btn.dataset.email;
    await stopEmployeeTimer(email);
  }
});

$('projectsTable').querySelector('tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains('btn-delete')) {
    await removeProj(id);
  } else if (btn.classList.contains('btn-activate') || btn.classList.contains('btn-deactivate')) {
    const activeState = btn.dataset.active === 'true';
    await toggleProjActive(id, activeState);
  } else if (btn.classList.contains('btn-edit-proj')) {
    await openEditProjModal(id);
  }
});

$('tasksTable').querySelector('tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains('btn-delete')) {
    await removeTask(id);
  } else if (btn.classList.contains('btn-edit-task')) {
    await openEditTaskModal(id);
  }
});

// ---------- EDIT EMPLOYEE MODAL HANDLERS ----------
async function openEditEmpModal(id) {
  const emps = await dbListAll('Employees');
  const matched = emps.find(e => e.employee_id === id);
  if (!matched) return;

  $('editEmpId').value = id;
  $('editEmpRowIndex').value = matched._rowNum || '';
  $('editEmpName').value = matched.name;
  $('editEmpEmail').value = matched.email;
  
  // Populate departments select dropdown in the modal
  const depts = await dbListAll('Departments');
  const formattedDepts = depts.map(d => {
    return {
      name: d.department_name,
      displayName: d.parent_department ? `${d.parent_department} - ${d.department_name}` : d.department_name
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));

  const options = formattedDepts.map(d => `<option value="${d.name}">${d.displayName}</option>`).join('');
  $('editEmpDept').innerHTML = options;
  $('editEmpDept').value = matched.department;

  $('editEmpRole').value = matched.role;
  $('editEmpModal').style.display = 'flex';
}

$('cancelEditEmpBtn').addEventListener('click', () => {
  $('editEmpModal').style.display = 'none';
});

$('saveEditEmpBtn').addEventListener('click', async () => {
  const id = $('editEmpId').value;
  const rowIndex = parseInt($('editEmpRowIndex').value, 10);
  const name = $('editEmpName').value.trim();
  const email = $('editEmpEmail').value.trim();
  const department = $('editEmpDept').value;
  const role = $('editEmpRole').value;

  if (!name || !email) {
    alert('Name and Email are required.');
    return;
  }

  $('saveEditEmpBtn').disabled = true;
  $('saveEditEmpBtn').textContent = 'Saving...';

  try {
    const emps = await dbListAll('Employees');
    const matched = emps.find(e => e.employee_id === id);
    if (matched) {
      const updated = {
        ...matched,
        name: name,
        email: email,
        department: department,
        role: role
      };
      await dbUpdate('Employees', 'employee_id', id, rowIndex, updated);
      $('editEmpModal').style.display = 'none';
      await refreshEmployees();
      populateFilterDropdowns();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    $('saveEditEmpBtn').disabled = false;
    $('saveEditEmpBtn').textContent = 'Save Changes';
  }
});

// ---------- STOP EMPLOYEE TIMER ----------
async function stopEmployeeTimer(email) {
  if (!confirm(`Are you sure you want to stop the active timer for ${email}?`)) {
    return;
  }
  try {
    let activeEntries = [];
    if (backendType === 'supabase') {
      activeEntries = await dbListAll('TimeEntries', 'end_time=is.null');
    } else {
      const all = await dbListAll('TimeEntries');
      activeEntries = all.filter(e => !e.end_time || e.end_time === 'null' || e.end_time === '');
    }

    const emailLower = email.toLowerCase();
    const entry = activeEntries.find(e => String(e.employee_email).toLowerCase() === emailLower);

    if (!entry) {
      alert('No running timer found for this employee.');
      return;
    }

    const startTime = new Date(entry.start_time);
    const endTime = new Date();
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    const updated = {
      ...entry,
      end_time: endTime.toISOString(),
      duration_minutes: durationMinutes
    };

    await dbUpdate('TimeEntries', 'entry_id', entry.entry_id, entry._rowNum, updated);
    alert('Timer stopped successfully.');
    await refreshEmployees();
    runReport();
  } catch (err) {
    alert(`Error stopping timer: ${err.message}`);
  }
}

// ---------- EDIT DEPARTMENT MODAL HANDLERS ----------
async function openEditDeptModal(id) {
  const depts = await dbListAll('Departments');
  const matched = depts.find(d => d.department_id === id);
  if (!matched) return;

  $('editDeptId').value = id;
  $('editDeptRowIndex').value = matched._rowNum || '';
  $('editDeptName').value = matched.department_name;

  // Populate parents dropdown excluding itself and recursive children to prevent infinite loops
  const forbidden = [matched.department_name.toLowerCase(), ...getRecursiveChildren(depts, matched.department_name).map(n => n.toLowerCase())];
  const allowedParents = depts.filter(d => !forbidden.includes(d.department_name.toLowerCase()));
  
  $('editDeptParent').innerHTML = '<option value="">-- No Parent (Root Department) --</option>' +
    allowedParents.map(d => `<option value="${d.department_name}">${getDepartmentFullPath(depts, d)}</option>`).join('');
  
  $('editDeptParent').value = matched.parent_department || '';
  $('editDeptModal').style.display = 'flex';
}

$('cancelEditDeptBtn').addEventListener('click', () => {
  $('editDeptModal').style.display = 'none';
});

$('saveEditDeptBtn').addEventListener('click', async () => {
  const id = $('editDeptId').value;
  const rowIndex = parseInt($('editDeptRowIndex').value, 10);
  const name = $('editDeptName').value.trim();
  const parent = $('editDeptParent').value;

  if (!name) {
    alert('Department name is required.');
    return;
  }

  $('saveEditDeptBtn').disabled = true;
  $('saveEditDeptBtn').textContent = 'Saving...';

  try {
    const depts = await dbListAll('Departments');
    const matched = depts.find(d => d.department_id === id);
    if (matched) {
      const updated = {
        ...matched,
        department_name: name,
        parent_department: parent || null
      };
      await dbUpdate('Departments', 'department_id', id, rowIndex, updated);
      $('editDeptModal').style.display = 'none';
      await refreshDepartments();
      await populateFilterDropdowns();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    $('saveEditDeptBtn').disabled = false;
    $('saveEditDeptBtn').textContent = 'Save Changes';
  }
});

// ---------- EDIT PROJECT MODAL HANDLERS ----------
async function openEditProjModal(id) {
  const projects = await dbListAll('Projects');
  const matched = projects.find(p => p.project_id === id);
  if (!matched) return;

  $('editProjId').value = id;
  $('editProjRowIndex').value = matched._rowNum || '';
  $('editProjName').value = matched.project_name;

  // Render department checkboxes in project edit modal
  const depts = await dbListAll('Departments');
  const formattedDepts = depts.map(d => {
    return {
      name: d.department_name,
      displayName: d.parent_department ? `${d.parent_department} - ${d.department_name}` : d.department_name
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));

  const matchedDepts = String(matched.department).split(',').map(d => d.trim().toLowerCase());

  const checkboxes = formattedDepts.map(d => {
    const isChecked = matchedDepts.includes(d.name.toLowerCase()) ? 'checked' : '';
    return `
      <label style="display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 13px; font-weight: normal; text-transform: none;">
        <input type="checkbox" name="editProjDeptCheck" value="${d.name}" ${isChecked} style="width: auto;">
        <span>${d.displayName}</span>
      </label>
    `;
  }).join('');

  $('editProjDeptsContainer').innerHTML = checkboxes || '<span class="status">No departments available</span>';
  $('editProjModal').style.display = 'flex';
}

$('cancelEditProjBtn').addEventListener('click', () => {
  $('editProjModal').style.display = 'none';
});

$('saveEditProjBtn').addEventListener('click', async () => {
  const id = $('editProjId').value;
  const rowIndex = parseInt($('editProjRowIndex').value, 10);
  const name = $('editProjName').value.trim();

  if (!name) {
    alert('Project name is required.');
    return;
  }

  const checkedDepts = Array.from($('editProjDeptsContainer').querySelectorAll('input[name="editProjDeptCheck"]:checked')).map(cb => cb.value);
  if (checkedDepts.length === 0) {
    alert('Please select at least one department for the project.');
    return;
  }

  $('saveEditProjBtn').disabled = true;
  $('saveEditProjBtn').textContent = 'Saving...';

  try {
    const projects = await dbListAll('Projects');
    const matched = projects.find(p => p.project_id === id);
    if (matched) {
      const updated = {
        ...matched,
        project_name: name,
        department: checkedDepts.join(', ')
      };
      await dbUpdate('Projects', 'project_id', id, rowIndex, updated);
      $('editProjModal').style.display = 'none';
      await refreshProjects();
      populateFilterDropdowns();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    $('saveEditProjBtn').disabled = false;
    $('saveEditProjBtn').textContent = 'Save Changes';
  }
});

// ---------- EDIT TASK PRESET MODAL HANDLERS ----------
async function openEditTaskModal(id) {
  const tasks = await dbListAll('TaskPresets');
  const matched = tasks.find(t => t.task_id === id);
  if (!matched) return;

  $('editTaskId').value = id;
  $('editTaskRowIndex').value = matched._rowNum || '';
  $('editTaskName').value = matched.task_name;

  // Populate departments dropdown
  const depts = await dbListAll('Departments');
  const formattedDepts = depts.map(d => {
    return {
      name: d.department_name,
      displayName: d.parent_department ? `${d.parent_department} - ${d.department_name}` : d.department_name
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));

  const options = formattedDepts.map(d => `<option value="${d.name}">${d.displayName}</option>`).join('');
  $('editTaskDept').innerHTML = options;
  $('editTaskDept').value = matched.department;

  $('editTaskModal').style.display = 'flex';
}

$('cancelEditTaskBtn').addEventListener('click', () => {
  $('editTaskModal').style.display = 'none';
});

$('saveEditTaskBtn').addEventListener('click', async () => {
  const id = $('editTaskId').value;
  const rowIndex = parseInt($('editTaskRowIndex').value, 10);
  const name = $('editTaskName').value.trim();
  const department = $('editTaskDept').value;

  if (!name) {
    alert('Task name is required.');
    return;
  }

  $('saveEditTaskBtn').disabled = true;
  $('saveEditTaskBtn').textContent = 'Saving...';

  try {
    const tasks = await dbListAll('TaskPresets');
    const matched = tasks.find(t => t.task_id === id);
    if (matched) {
      const updated = {
        ...matched,
        task_name: name,
        department: department
      };
      await dbUpdate('TaskPresets', 'task_id', id, rowIndex, updated);
      $('editTaskModal').style.display = 'none';
      await refreshTasks();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    $('saveEditTaskBtn').disabled = false;
    $('saveEditTaskBtn').textContent = 'Save Changes';
  }
});

// ---------- THE NEST (SETTINGS & COMPLIANCE) ----------
async function getCompanySetting(settings, key, defaultVal = '') {
  const found = settings.find(s => s.setting_key === key);
  return found ? found.setting_value : defaultVal;
}

async function setCompanySetting(key, val) {
  try {
    const settings = await dbListAll('CompanySettings');
    const found = settings.find(s => s.setting_key === key);
    if (found) {
      await dbUpdate('CompanySettings', 'setting_key', key, found._rowNum, { setting_key: key, setting_value: String(val) });
    } else {
      await dbInsert('CompanySettings', { setting_key: key, setting_value: String(val) });
    }
  } catch (e) {
    console.error(`Failed to update setting ${key}:`, e);
    throw e;
  }
}

async function refreshNestTab() {
  if (currentEmployee.role !== 'admin') return;

  $('saveCompanyNameBtn').disabled = true;
  $('saveNotificationsBtn').disabled = true;

  try {
    const settings = await dbListAll('CompanySettings');
    const getVal = key => {
      const found = settings.find(s => s.setting_key === key);
      return found ? found.setting_value : '';
    };

    $('nestCompanyName').value = getVal('company_name') || 'My Company';

    $('nestNotifyMorningTime').value = getVal('notify_morning_time') || '09:00';
    $('nestNotifyMorningEnabled').checked = getVal('notify_morning_enabled') === 'true';

    $('nestNotifyLunchStartTime').value = getVal('notify_lunch_start_time') || '13:00';
    $('nestNotifyLunchStartEnabled').checked = getVal('notify_lunch_start_enabled') === 'true';

    $('nestNotifyLunchEndTime').value = getVal('notify_lunch_end_time') || '14:00';
    $('nestNotifyLunchEndEnabled').checked = getVal('notify_lunch_end_enabled') === 'true';

    $('nestNotifyEveningTime').value = getVal('notify_evening_time') || '18:00';
    $('nestNotifyEveningEnabled').checked = getVal('notify_evening_enabled') === 'true';

    $('nestInviteMethod').value = getVal('invitation_method') || 'mailto';
    $('resendConfigContainer').style.display = $('nestInviteMethod').value === 'resend' ? 'flex' : 'none';
    $('nestResendApiKey').value = getVal('resend_api_key') || '';
    $('nestResendSender').value = getVal('resend_sender') || 'onboarding@resend.dev';

    await loadNestComplianceData();
  } catch (e) {
    console.error('Failed to load settings in Nest:', e);
  } finally {
    $('saveCompanyNameBtn').disabled = false;
    $('saveNotificationsBtn').disabled = false;
  }
}

async function loadNestComplianceData() {
  try {
    const [emps, projects, entries] = await Promise.all([
      dbListAll('Employees'),
      dbListAll('Projects'),
      dbListAll('TimeEntries')
    ]);

    // Monday of current week
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);

    const thisWeeksEntries = entries.filter(e => new Date(e.start_time) >= startOfWeek && e.end_time);

    // Calculate and populate Nest KPIs
    const totalWeeklyMinutes = thisWeeksEntries.reduce((sum, e) => sum + Number(e.duration_minutes || 0), 0);
    const totalWeeklyHours = Math.round((totalWeeklyMinutes / 60) * 10) / 10;
    $('nestKpiTotalHours').textContent = `${totalWeeklyHours}h`;

    const activeTrackingEntries = entries.filter(e => !e.end_time);
    const activeTrackingEmails = new Set(activeTrackingEntries.map(e => String(e.employee_email).toLowerCase()));
    const totalActiveStaff = emps.filter(e => isSheetValueActive(e.active) && e.role !== 'admin');
    const trackingCount = totalActiveStaff.filter(e => activeTrackingEmails.has(e.email.toLowerCase())).length;
    $('nestKpiActiveEmployees').textContent = `${trackingCount} / ${totalActiveStaff.length}`;

    const activeProjectsCount = projects.filter(p => isSheetValueActive(p.active)).length;
    $('nestKpiTotalProjects').textContent = activeProjectsCount;

    const empHours = {};
    emps.forEach(e => {
      if (isSheetValueActive(e.active) && e.role !== 'admin') {
        empHours[e.email.toLowerCase()] = { name: e.name, hours: 0 };
      }
    });

    thisWeeksEntries.forEach(entry => {
      const email = entry.employee_email.toLowerCase();
      if (empHours[email]) {
        empHours[email].hours += Number(entry.duration_minutes || 0) / 60;
      }
    });

    const sortedEmps = Object.values(empHours)
      .sort((a, b) => a.hours - b.hours)
      .slice(0, 5);

    $('underTrackedEmployeesList').innerHTML = sortedEmps.map(eh => {
      const hours = Math.round(eh.hours * 10) / 10;
      const percent = Math.min(100, Math.round((hours / 20) * 100));
      const progressColor = percent < 40 ? 'var(--accent-rose)' : percent < 80 ? 'var(--accent-orange)' : '#10b981';
      return `
        <div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; margin-bottom: 2px;">
            <span>${eh.name}</span>
            <span>${hours}h / 20h</span>
          </div>
          <div style="width: 100%; height: 8px; border-radius: 4px; background: var(--bg-primary); overflow: hidden;">
            <div style="width: ${percent}%; height: 100%; background: ${progressColor};"></div>
          </div>
        </div>
      `;
    }).join('') || '<span class="status">All employees are tracking correctly!</span>';

    const projHours = {};
    projects.forEach(p => {
      if (isSheetValueActive(p.active)) {
        projHours[p.project_id] = { name: p.project_name, hours: 0 };
      }
    });

    thisWeeksEntries.forEach(entry => {
      const pid = entry.project_id;
      if (projHours[pid]) {
        projHours[pid].hours += Number(entry.duration_minutes || 0) / 60;
      }
    });

    const sortedProjs = Object.values(projHours)
      .sort((a, b) => a.hours - b.hours)
      .slice(0, 5);

    $('coldProjectsList').innerHTML = sortedProjs.map(ph => {
      const hours = Math.round(ph.hours * 10) / 10;
      return `
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; border-bottom: 1px dashed var(--border-color); padding-bottom: 6px;">
          <span style="font-weight: 600; color: var(--text-primary);">${ph.name}</span>
          <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(244, 63, 94, 0.08); color: var(--accent-rose); font-weight: 600;">${hours} hours logged</span>
        </div>
      `;
    }).join('') || '<span class="status">No active projects.</span>';

  } catch (e) {
    console.error('Failed to load compliance data:', e);
    $('underTrackedEmployeesList').innerHTML = '<span class="status">Failed to calculate compliance logs.</span>';
    $('coldProjectsList').innerHTML = '<span class="status">Failed to load projects data.</span>';
  }
}

$('saveCompanyNameBtn').addEventListener('click', async () => {
  const name = $('nestCompanyName').value.trim();
  if (!name) return;
  $('saveCompanyNameBtn').disabled = true;
  $('saveCompanyNameBtn').textContent = 'Saving...';
  try {
    await setCompanySetting('company_name', name);
    alert('Company Name saved successfully.');
  } catch (err) {
    alert(`Error saving company name: ${err.message}`);
  } finally {
    $('saveCompanyNameBtn').disabled = false;
    $('saveCompanyNameBtn').textContent = 'Save Company Name';
  }
});

$('saveNotificationsBtn').addEventListener('click', async () => {
  $('saveNotificationsBtn').disabled = true;
  $('saveNotificationsBtn').textContent = 'Saving...';
  try {
    await setCompanySetting('notify_morning_time', $('nestNotifyMorningTime').value);
    await setCompanySetting('notify_morning_enabled', $('nestNotifyMorningEnabled').checked);

    await setCompanySetting('notify_lunch_start_time', $('nestNotifyLunchStartTime').value);
    await setCompanySetting('notify_lunch_start_enabled', $('nestNotifyLunchStartEnabled').checked);

    await setCompanySetting('notify_lunch_end_time', $('nestNotifyLunchEndTime').value);
    await setCompanySetting('notify_lunch_end_enabled', $('nestNotifyLunchEndEnabled').checked);

    await setCompanySetting('notify_evening_time', $('nestNotifyEveningTime').value);
    await setCompanySetting('notify_evening_enabled', $('nestNotifyEveningEnabled').checked);

    alert('Global notification schedule saved successfully.');
  } catch (err) {
    alert(`Error saving notification settings: ${err.message}`);
  } finally {
    $('saveNotificationsBtn').disabled = false;
    $('saveNotificationsBtn').textContent = 'Save Notification Settings';
  }
});

// Save Invitation Settings
$('saveInviteSettingsBtn').addEventListener('click', async () => {
  $('saveInviteSettingsBtn').disabled = true;
  $('saveInviteSettingsBtn').textContent = 'Saving...';
  try {
    await setCompanySetting('invitation_method', $('nestInviteMethod').value);
    await setCompanySetting('resend_api_key', $('nestResendApiKey').value.trim());
    await setCompanySetting('resend_sender', $('nestResendSender').value.trim());
    alert('Invitation delivery settings saved successfully.');
  } catch (err) {
    alert(`Error saving invitation settings: ${err.message}`);
  } finally {
    $('saveInviteSettingsBtn').disabled = false;
    $('saveInviteSettingsBtn').textContent = 'Save Invitation Settings';
  }
});

// Toggle Resend Inputs view
$('nestInviteMethod').addEventListener('change', () => {
  $('resendConfigContainer').style.display = $('nestInviteMethod').value === 'resend' ? 'flex' : 'none';
});

$('deleteCompanyBtn').addEventListener('click', async () => {
  const confirmation1 = confirm("⚠️ DANGER ZONE: Are you sure you want to delete this entire company workspace?\n\nThis will permanently delete all employee profiles, logged hours, projects, departments, and configuration data. This CANNOT be undone!");
  if (!confirmation1) return;

  const confirmation2 = confirm("⚠️ FINAL CONFIRMATION:\n\nAre you absolutely sure? All database rows will be wiped out.");
  if (!confirmation2) return;

  $('deleteCompanyBtn').disabled = true;
  $('deleteCompanyBtn').textContent = 'Wiping Database...';

  try {
    const tables = ['TimeEntries', 'TaskPresets', 'Projects', 'Departments', 'Employees', 'CompanySettings'];
    for (const tbl of tables) {
      try {
        const rows = await dbListAll(tbl);
        for (const r of rows) {
          const pk = tbl === 'Employees' ? 'employee_id' : tbl === 'Projects' ? 'project_id' : tbl === 'TaskPresets' ? 'task_id' : tbl === 'Departments' ? 'department_id' : tbl === 'TimeEntries' ? 'entry_id' : 'setting_key';
          await dbDelete(tbl, pk, r[pk], r._rowNum);
        }
      } catch (tblErr) {
        console.error(`Failed to wipe table ${tbl}:`, tblErr);
      }
    }
    alert('Workspace deleted successfully. The extension will now reload.');
    await chrome.storage.local.clear();
    window.location.reload();
  } catch (err) {
    alert(`Error during deletion: ${err.message}`);
  } finally {
    $('deleteCompanyBtn').disabled = false;
    $('deleteCompanyBtn').textContent = 'Delete Company Workspace';
  }
});

init();
