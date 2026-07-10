let backendType = null;
let supabaseUrl = null;
let supabaseAnonKey = null;
let supabaseToken = null;

let authToken = null;
let spreadsheetId = null;
let userEmail = null;
let currentReportEntries = [];
let sortField = 'date';
let sortAscending = false;

const $ = id => document.getElementById(id);

const HEADERS = {
  Employees: ['employee_id', 'email', 'name', 'department', 'role', 'active'],
  Departments: ['department_id', 'department_name', 'parent_department'],
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

// ---------- DYNAMIC DATABASE ROUTER HELPERS ----------

function getTableName(sheetName) {
  if (backendType === 'sheets') return sheetName;
  const mapping = {
    'Departments': 'departments',
    'Employees': 'employees',
    'Projects': 'projects',
    'TaskPresets': 'task_presets',
    'TimeEntries': 'time_entries'
  };
  return mapping[sheetName];
}

async function dbListAll(sheetName) {
  if (backendType === 'sheets') {
    return await GoogleAPI.listAll(spreadsheetId, authToken, sheetName);
  } else {
    const tableName = getTableName(sheetName);
    return await SupabaseAPI.listAll(supabaseUrl, supabaseAnonKey, supabaseToken, tableName);
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
      document.body.innerHTML = `
        <div class="container" style="text-align: center; margin-top: 100px;">
          <h2>Configuration Missing</h2>
          <p>Database backend is not configured yet. Please open the Extension popup first to complete the setup.</p>
        </div>
      `;
      return;
    }

    if (backendType === 'sheets') {
      // sheets verification
      authToken = await GoogleAPI.getAuthToken(true);
      userEmail = (await fetchUserProfile(authToken)).email;
      spreadsheetId = await GoogleAPI.findSpreadsheet(authToken);
      if (!spreadsheetId) {
        alert('Spreadsheet not found. Open the Extension popup first to generate the tracker.');
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

    // Verify user is active admin
    const employees = await dbListAll('Employees');
    const emp = employees.find(e => e.email.toLowerCase() === userEmail.toLowerCase() && (e.active === 'TRUE' || e.active === 'true' || e.active === true));
    
    if (!emp || emp.role !== 'admin') {
      document.body.innerHTML = `
        <div class="container" style="text-align: center; margin-top: 100px;">
          <h2>Access Denied</h2>
          <p>You must be registered as an "admin" in the employees list to access this dashboard.</p>
        </div>
      `;
      return;
    }

    // Refresh lists
    await Promise.all([
      refreshDepartments(),
      refreshEmployees(),
      refreshProjects(),
      refreshTasks()
    ]);

    await populateFilterDropdowns();
  } catch (err) {
    alert(`Failed to load Admin Dashboard: ${err.message}`);
  }
}

async function fetchUserProfile(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to load Google profile.');
  return await res.json();
}

// ---------- TABS NAVIGATION ----------
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    
    t.classList.add('active');
    $(t.dataset.tab ? `tab-${t.dataset.tab}` : '').classList.add('active');
  });
});

// ---------- DEPARTMENTS ----------
async function refreshDepartments() {
  const depts = await dbListAll('Departments');
  
  // Format options with Parent - Sub layout
  const formattedDepts = depts.map(d => {
    return {
      id: d.department_id,
      name: d.department_name,
      parent: d.parent_department || '',
      displayName: d.parent_department ? `${d.parent_department} - ${d.department_name}` : d.department_name
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));

  const options = formattedDepts.map(d => `<option value="${d.name}">${d.displayName}</option>`).join('');
  $('empDept').innerHTML = options;
  $('taskDept').innerHTML = options;
  
  // Also populate the parent selection dropdown inside Departments tab
  // Note: Only root departments (those without parents) can be selected as parents, to prevent infinite loops!
  const rootDepts = formattedDepts.filter(d => !d.parent);
  $('deptParent').innerHTML = '<option value="">-- No Parent (Root Department) --</option>' + 
    rootDepts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');

  const deptCheckboxes = formattedDepts.map(d => `
    <label style="display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 13px; font-weight: normal; text-transform: none;">
      <input type="checkbox" name="projDeptCheck" value="${d.name}" style="width: auto;">
      <span>${d.displayName}</span>
    </label>
  `).join('');
  $('projDeptsContainer').innerHTML = deptCheckboxes || '<span class="status">No departments available</span>';

  $('departmentsTable').querySelector('tbody').innerHTML = formattedDepts.map(d => `
    <tr>
      <td style="font-weight: 500;">${d.name}</td>
      <td>${d.parent ? `<span class="badge" style="background-color: var(--bg-tertiary);">${d.parent}</span>` : '<span style="color: var(--text-muted); font-size: 12px;">None (Root)</span>'}</td>
      <td><button class="btn-secondary btn-delete" data-id="${d.id}">Delete</button></td>
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
  const emps = await dbListAll('Employees');
  
  // Calculate active and total employee counts
  const activeCount = emps.filter(e => String(e.active) === 'TRUE' || e.active === 'true' || e.active === true).length;
  $('registeredEmployeesTitle').textContent = `Registered Employees (Active: ${activeCount} / Total: ${emps.length})`;

  $('employeesTable').querySelector('tbody').innerHTML = emps.map(e => {
    const active = String(e.active) === 'TRUE' || e.active === 'true' || e.active === true;
    const statusText = active ? 'Active' : 'Inactive';
    const toggleText = active ? 'Deactivate' : 'Activate';
    const statusClass = active ? 'status-active' : 'status-inactive';
    const toggleBtnClass = active ? 'btn-deactivate' : 'btn-activate';
    return `
      <tr>
        <td style="font-weight: 600; color: var(--text-primary);">${e.name}</td>
        <td>${e.email}</td>
        <td>${e.department}</td>
        <td><span class="badge" style="background-color: var(--bg-tertiary);">${e.role}</span></td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
        <td>
          <button class="btn-secondary btn-edit-emp" data-id="${e.employee_id}" style="margin-right: 4px;">Edit</button>
          <button class="btn-secondary ${toggleBtnClass}" data-id="${e.employee_id}" data-active="${!active}" style="margin-right: 4px;">${toggleText}</button>
          <button class="btn-secondary btn-delete" data-id="${e.employee_id}">Delete</button>
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
  if (!email || !name) { alert('Email and name are required.'); return; }
  
  const newId = Math.random().toString(36).substring(2, 10);
  
  $('addEmpBtn').disabled = true;
  try {
    await dbInsert('Employees', {
      employee_id: newId,
      email: email,
      name: name,
      department: $('empDept').value,
      role: $('empRole').value,
      active: true
    });
    $('empEmail').value = '';
    $('empName').value = '';
    await refreshEmployees();
    populateFilterDropdowns();
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
  const projects = await dbListAll('Projects');
  $('projectsTable').querySelector('tbody').innerHTML = projects.map(p => {
    const active = String(p.active) === 'TRUE' || p.active === 'true' || p.active === true;
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
          <button class="btn-secondary ${toggleBtnClass}" data-id="${p.project_id}" data-active="${!active}">${toggleText}</button>
          <button class="btn-secondary btn-delete" data-id="${p.project_id}">Delete</button>
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
  const tasks = await dbListAll('TaskPresets');
  $('tasksTable').querySelector('tbody').innerHTML = tasks.map(t => `
    <tr>
      <td>${t.task_name}</td>
      <td>${t.department}</td>
      <td><button class="btn-secondary btn-delete" data-id="${t.task_id}">Delete</button></td>
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
    // 1. Fetch completed entries
    const allEntries = await dbListAll('TimeEntries');
    let entries = allEntries.filter(e => e.end_time); // completed only
    
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
  }
});

$('tasksTable').querySelector('tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains('btn-delete')) {
    await removeTask(id);
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

init();
