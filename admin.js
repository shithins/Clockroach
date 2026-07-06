const $ = id => document.getElementById(id);

// ---------- STATE ----------
let currentReportEntries = [];
let sortField = null;
let sortAscending = true;

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

// ---------- TAB SWITCHING ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    $('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ---------- INIT ----------
async function init() {
  await initTheme();
  await refreshDepartments();
  await refreshEmployees();
  await refreshProjects();
  await refreshTasks();
  await populateFilterDropdowns();
}

// ---------- DURATION HELPERS (HH:MM:SS) ----------
function getEntryDurationSeconds(e) {
  if (!e.start_time || !e.end_time) return 0;
  const start = new Date(e.start_time);
  const end = new Date(e.end_time);
  const diffMs = end - start;
  return Math.max(0, Math.floor(diffMs / 1000));
}

function formatSecondsToHMS(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ---------- DEPARTMENTS ----------
async function refreshDepartments() {
  const depts = await apiCall('getDepartments');
  
  // Update dropdown options
  const options = depts.map(d => `<option value="${d.department_name}">${d.department_name}</option>`).join('');
  $('empDept').innerHTML = options;
  $('taskDept').innerHTML = options;
  
  // Dynamically populate multi-select checkbox list for adding projects
  const deptCheckboxes = depts.map(d => `
    <label style="display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 13px; font-weight: normal; text-transform: none; color: var(--text-primary);">
      <input type="checkbox" name="projDeptCheck" value="${d.department_name}" style="width: auto;">
      <span>${d.department_name}</span>
    </label>
  `).join('');
  $('projDeptsContainer').innerHTML = deptCheckboxes || '<span class="status">No departments available</span>';

  $('departmentsTable').querySelector('tbody').innerHTML = depts.map(d => `
    <tr>
      <td style="font-weight: 500;">${d.department_name}</td>
      <td><button class="btn-secondary btn-delete" onclick="removeDept('${d.department_id}')">Delete</button></td>
    </tr>
  `).join('');
}

$('addDeptBtn').addEventListener('click', async () => {
  const name = $('deptName').value.trim();
  if (!name) return;
  await apiCall('addDepartment', { department_name: name });
  $('deptName').value = '';
  await refreshDepartments();
  await populateFilterDropdowns();
});

window.removeDept = async function(id) {
  if (confirm('Are you sure you want to delete this department? This won\'t delete linked entries, but may affect filters.')) {
    await apiCall('removeDepartment', { department_id: id });
    await refreshDepartments();
    await populateFilterDropdowns();
  }
};

// ---------- EMPLOYEES ----------
async function refreshEmployees() {
  const emps = await apiCall('listEmployees');
  $('employeesTable').querySelector('tbody').innerHTML = emps.map(e => {
    const active = String(e.active) === 'true' || e.active === true;
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
          <button class="btn-secondary ${toggleBtnClass}" onclick="toggleEmpActive('${e.employee_id}', ${!active})">${toggleText}</button>
          <button class="btn-secondary btn-delete" onclick="removeEmp('${e.employee_id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.toggleEmpActive = async function(id, activeState) {
  await apiCall('updateEmployee', { employee_id: id, active: activeState });
  await refreshEmployees();
  populateFilterDropdowns();
};

$('addEmpBtn').addEventListener('click', async () => {
  const email = $('empEmail').value.trim();
  const name = $('empName').value.trim();
  if (!email || !name) { alert('Email and name are required.'); return; }
  await apiCall('addEmployee', {
    email,
    name,
    department: $('empDept').value,
    role: $('empRole').value,
    active: true
  });
  $('empEmail').value = '';
  $('empName').value = '';
  await refreshEmployees();
  populateFilterDropdowns();
});

window.removeEmp = async function(id) {
  if (confirm('Delete this employee record permanently from the database?')) {
    await apiCall('removeEmployee', { employee_id: id });
    await refreshEmployees();
    populateFilterDropdowns();
  }
};

// ---------- PROJECTS ----------
async function refreshProjects() {
  const projects = await apiCall('listProjects');
  $('projectsTable').querySelector('tbody').innerHTML = projects.map(p => {
    const active = String(p.active) === 'true' || p.active === true;
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
          <button class="btn-secondary ${toggleBtnClass}" onclick="toggleProjActive('${p.project_id}', ${!active})">${toggleText}</button>
          <button class="btn-secondary btn-delete" onclick="removeProj('${p.project_id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.toggleProjActive = async function(id, activeState) {
  await apiCall('updateProject', { project_id: id, active: activeState });
  await refreshProjects();
  populateFilterDropdowns();
};

$('addProjBtn').addEventListener('click', async () => {
  const name = $('projName').value.trim();
  if (!name) return;
  
  // Extract all selected departments checked
  const checkedDepts = Array.from($('projDeptsContainer').querySelectorAll('input[name="projDeptCheck"]:checked')).map(cb => cb.value);
  if (checkedDepts.length === 0) {
    alert('Please select at least one department for the project.');
    return;
  }

  await apiCall('addProject', {
    project_name: name,
    department: checkedDepts.join(', '), // Save as comma-separated list
    active: true
  });
  
  $('projName').value = '';
  // Uncheck all departments
  $('projDeptsContainer').querySelectorAll('input[name="projDeptCheck"]').forEach(cb => cb.checked = false);
  
  await refreshProjects();
  populateFilterDropdowns();
});

window.removeProj = async function(id) {
  if (confirm('Delete this project permanently from the database?')) {
    await apiCall('removeProject', { project_id: id });
    await refreshProjects();
    populateFilterDropdowns();
  }
};

// ---------- TASK PRESETS ----------
async function refreshTasks() {
  const tasks = await apiCall('listTaskPresets');
  $('tasksTable').querySelector('tbody').innerHTML = tasks.map(t => `
    <tr>
      <td>${t.task_name}</td>
      <td>${t.department}</td>
      <td><button class="btn-secondary btn-delete" onclick="removeTask('${t.task_id}')">Delete</button></td>
    </tr>
  `).join('');
}

$('addTaskBtn').addEventListener('click', async () => {
  const name = $('taskName').value.trim();
  if (!name) return;
  await apiCall('addTaskPreset', {
    task_name: name,
    department: $('taskDept').value,
    active: true
  });
  $('taskName').value = '';
  await refreshTasks();
});

window.removeTask = async function(id) {
  if (confirm('Delete this task preset?')) {
    await apiCall('removeTaskPreset', { task_id: id });
    await refreshTasks();
  }
};

// ---------- REPORTS ----------
async function populateFilterDropdowns() {
  const emps = await apiCall('listEmployees');
  $('filterEmployee').innerHTML = '<option value="">All employees</option>' +
    emps.map(e => `<option value="${e.email}">${e.name} (${e.email})</option>`).join('');

  const projects = await apiCall('listProjects');
  
  // Populate the project multi-select dropdown menu
  const dropdown = $('projectSelectDropdown');
  dropdown.innerHTML = projects.map(p => `
    <label class="multiselect-option">
      <input type="checkbox" name="filterProjectCheck" value="${p.project_id}" data-name="${p.project_name}">
      <span>${p.project_name}</span>
    </label>
  `).join('');
  $('projectSelectTrigger').textContent = 'All projects';

  const depts = await apiCall('getDepartments');
  $('filterDepartment').innerHTML = '<option value="">All departments</option>' +
    depts.map(d => `<option value="${d.department_name}">${d.department_name}</option>`).join('');
}

// Multiselect dropdown toggler
$('projectSelectTrigger').addEventListener('click', (e) => {
  e.stopPropagation();
  const dropdown = $('projectSelectDropdown');
  const isHidden = dropdown.style.display === 'none';
  dropdown.style.display = isHidden ? 'block' : 'none';
});

$('projectSelectDropdown').addEventListener('click', (e) => {
  e.stopPropagation(); // Avoid closing trigger when clicking options
});

document.addEventListener('click', () => {
  $('projectSelectDropdown').style.display = 'none';
});

// Update multiselect trigger button label dynamically on selection changes
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
  // Collect all checked projects
  const checkedProjects = Array.from($('projectSelectDropdown').querySelectorAll('input[name="filterProjectCheck"]:checked')).map(cb => cb.value);
  
  const params = {
    employee_email: $('filterEmployee').value,
    project_id: checkedProjects.join(','),
    department: $('filterDepartment').value,
    start_date: $('filterStart').value,
    end_date: $('filterEnd').value
  };
  
  $('totalHoursLabel').textContent = 'Loading Report...';
  const report = await apiCall('getReport', params);

  // Set global state
  currentReportEntries = report.entries || [];
  
  // Toggle summary view visibility
  $('summaryCard').style.display = 'block';
  $('detailCard').style.display = 'block';
  
  if (currentReportEntries.length > 0) {
    $('exportCsvBtn').style.display = 'inline-flex';
  } else {
    $('exportCsvBtn').style.display = 'none';
  }

  // Calculate precise duration totals in seconds on client side
  const totalSeconds = currentReportEntries.reduce((sum, e) => sum + getEntryDurationSeconds(e), 0);
  $('totalHoursLabel').textContent = `Total: ${formatSecondsToHMS(totalSeconds)}`;

  // Group seconds by employee
  const employeeSeconds = {};
  currentReportEntries.forEach(e => {
    employeeSeconds[e.employee_email] = (employeeSeconds[e.employee_email] || 0) + getEntryDurationSeconds(e);
  });

  // Render By Employee table in HH:MM:SS
  $('byEmployeeTable').querySelector('tbody').innerHTML = Object.entries(employeeSeconds)
    .map(([email, secs]) => `<tr><td>${email}</td><td><strong>${formatSecondsToHMS(secs)}</strong></td></tr>`).join('');

  // Group seconds by project
  const projectSeconds = {};
  const projectContributors = {}; // project_name -> { email -> seconds }
  
  currentReportEntries.forEach(e => {
    // Project totals
    projectSeconds[e.project_name] = (projectSeconds[e.project_name] || 0) + getEntryDurationSeconds(e);
    
    // Contributor breakdown
    if (!projectContributors[e.project_name]) {
      projectContributors[e.project_name] = {};
    }
    projectContributors[e.project_name][e.employee_email] = 
      (projectContributors[e.project_name][e.employee_email] || 0) + getEntryDurationSeconds(e);
  });

  // Render By Project table with contributors nested in HH:MM:SS
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
      // Contributors nesting
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

  // Render Employee x Project breakdown (Daily details) if both filters are populated
  if (params.employee_email && checkedProjects.length === 1) {
    $('employeeProjectBreakdownBox').style.display = 'block';
    $('breakdownIndicator').style.display = 'inline-flex';
    
    const dailyGroup = {}; // date_string -> { seconds: X, tasks: Set }
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

  // Render detailed entries log
  renderDetailTable(currentReportEntries);
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
    
    // Visual header sorting indicators
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

// ---------- QUICK PRESETS ----------
$('quickToday').addEventListener('click', () => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
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

$('quickMonth').addEventListener('click', () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  $('filterStart').value = start.toISOString().slice(0, 10);
  $('filterEnd').value = now.toISOString().slice(0, 10);
  runReport();
});

// ---------- EXECUTION ----------
init();
