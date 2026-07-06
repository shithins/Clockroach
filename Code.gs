/**
 * COMPANY TIME TRACKER — Backend API
 * ------------------------------------------------
 * Paste this into the Apps Script editor of a bound Google Sheet
 * (Extensions > Apps Script from within the Sheet).
 *
 * SETUP:
 * 1. Run initSheets() once (select it in the dropdown, click Run).
 *    This creates all tabs with headers and a couple of sample rows.
 * 2. Deploy > New deployment > type: Web app
 *      - Execute as: Me
 *      - Who has access: Anyone  (see security note in SETUP.md)
 * 3. Copy the Web App URL into extension/config.js as API_URL.
 */

const SHEETS = {
  EMPLOYEES: 'Employees',
  DEPARTMENTS: 'Departments',
  PROJECTS: 'Projects',
  TASKPRESETS: 'TaskPresets',
  TIMEENTRIES: 'TimeEntries'
};

const HEADERS = {
  Employees: ['employee_id', 'email', 'name', 'department', 'role', 'active'],
  Departments: ['department_id', 'department_name'],
  Projects: ['project_id', 'project_name', 'department', 'active'],
  TaskPresets: ['task_id', 'task_name', 'department', 'active'],
  TimeEntries: ['entry_id', 'employee_email', 'project_id', 'project_name', 'department', 'task_description', 'start_time', 'end_time', 'duration_minutes']
};

// ---------- SETUP ----------

function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    sheet.clear();
    sheet.appendRow(HEADERS[name]);
    sheet.setFrozenRows(1);
  });

  // Sample data so you can test immediately — replace/delete freely.
  const dept = ss.getSheetByName(SHEETS.DEPARTMENTS);
  dept.appendRow(['D1', 'SEO']);
  dept.appendRow(['D2', 'Ads']);
  dept.appendRow(['D3', 'Dev']);

  const proj = ss.getSheetByName(SHEETS.PROJECTS);
  proj.appendRow(['P1', 'ATDC', 'SEO', true]);
  proj.appendRow(['P2', 'PVS', 'SEO', true]);

  const tasks = ss.getSheetByName(SHEETS.TASKPRESETS);
  tasks.appendRow(['T1', 'Audit', 'SEO', true]);
  tasks.appendRow(['T2', 'Onpage Optimization', 'SEO', true]);
  tasks.appendRow(['T3', 'Landing Page Setup', 'SEO', true]);

  const emp = ss.getSheetByName(SHEETS.EMPLOYEES);
  emp.appendRow(['E1', 'admin@yourcompany.com', 'Admin User', 'SEO', 'admin', true]);
  emp.appendRow(['E2', 'amritha@yourcompany.com', 'Amritha', 'SEO', 'employee', true]);

  SpreadsheetApp.getUi().alert('Sheets initialized with sample data. Replace the sample emails/rows with real ones before rollout.');
}

// ---------- HTTP ENTRY POINTS ----------

function doGet(e) {
  return handle(e.parameter);
}

function doPost(e) {
  let params;
  try {
    params = JSON.parse(e.postData.contents);
  } catch (err) {
    params = e.parameter;
  }
  return handle(params);
}

function handle(params) {
  const action = params.action;
  let result;
  try {
    switch (action) {
      case 'getEmployee': result = getEmployee(params.email); break;
      case 'getDepartments': result = listAll(SHEETS.DEPARTMENTS); break;
      case 'getProjects': result = getProjects(params.department); break;
      case 'getTaskPresets': result = getTaskPresets(params.department); break;
      case 'getRunningTimer': result = getRunningTimer(params.email); break;
      case 'startTimer': result = startTimer(params); break;
      case 'stopTimer': result = stopTimer(params); break;
      case 'getEmployeeDashboardData': result = getEmployeeDashboardData(params); break;
      case 'updateTimeEntry': result = updateTimeEntry(params); break;

      case 'listEmployees': result = listAll(SHEETS.EMPLOYEES); break;
      case 'addEmployee': result = addRow(SHEETS.EMPLOYEES, params); break;
      case 'updateEmployee': result = updateRow(SHEETS.EMPLOYEES, 'employee_id', params); break;
      case 'removeEmployee': result = deleteRow(SHEETS.EMPLOYEES, 'employee_id', params.employee_id); break;

      case 'addDepartment': result = addRow(SHEETS.DEPARTMENTS, params); break;
      case 'removeDepartment': result = deleteRow(SHEETS.DEPARTMENTS, 'department_id', params.department_id); break;

      case 'listProjects': result = listAll(SHEETS.PROJECTS); break;
      case 'addProject': result = addRow(SHEETS.PROJECTS, params); break;
      case 'updateProject': result = updateRow(SHEETS.PROJECTS, 'project_id', params); break;
      case 'removeProject': result = deleteRow(SHEETS.PROJECTS, 'project_id', params.project_id); break;

      case 'listTaskPresets': result = listAll(SHEETS.TASKPRESETS); break;
      case 'addTaskPreset': result = addRow(SHEETS.TASKPRESETS, params); break;
      case 'removeTaskPreset': result = deleteRow(SHEETS.TASKPRESETS, 'task_id', params.task_id); break;

      case 'getReport': result = getReport(params); break;

      case 'setupAutomationTriggers': result = setupAutomationTriggers(); break;
      case 'archiveOldEntries': result = archiveOldEntries(); break;
      case 'sendForgottenTimerEmails': result = sendForgottenTimerEmails(); break;

      default: result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- GENERIC SHEET HELPERS ----------

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function listAll(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.join('') !== '') // skip blank rows
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function addRow(sheetName, data) {
  const sheet = getSheet(sheetName);
  const headers = HEADERS[sheetName];
  if (!data[headers[0]]) data[headers[0]] = Utilities.getUuid().slice(0, 8);
  if (data.active === undefined && headers.includes('active')) data.active = true;
  const row = headers.map(h => data[h] !== undefined ? data[h] : '');
  sheet.appendRow(row);
  return { success: true, id: data[headers[0]] };
}

function findRowIndex(sheetName, idField, idValue) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf(idField);
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(idValue)) return i + 1; // 1-indexed sheet row
  }
  return -1;
}

function updateRow(sheetName, idField, data) {
  const sheet = getSheet(sheetName);
  const headers = HEADERS[sheetName];
  const rowIndex = findRowIndex(sheetName, idField, data[idField]);
  if (rowIndex === -1) return { error: 'Not found' };
  headers.forEach((h, i) => {
    if (data[h] !== undefined) sheet.getRange(rowIndex, i + 1).setValue(data[h]);
  });
  return { success: true };
}

function deleteRow(sheetName, idField, idValue) {
  const rowIndex = findRowIndex(sheetName, idField, idValue);
  if (rowIndex === -1) return { error: 'Not found' };
  getSheet(sheetName).deleteRow(rowIndex);
  return { success: true };
}

// ---------- DOMAIN LOGIC ----------

function getEmployee(email) {
  const emp = listAll(SHEETS.EMPLOYEES).find(e => e.email.toLowerCase() === String(email).toLowerCase() && e.active);
  return emp || { error: 'Employee not found or inactive' };
}

function getProjects(department) {
  let projects = listAll(SHEETS.PROJECTS).filter(p => p.active);
  if (department) {
    projects = projects.filter(p => {
      if (!p.department) return false;
      const depts = String(p.department).split(',').map(d => d.trim().toLowerCase());
      return depts.includes(department.toLowerCase());
    });
  }
  return projects;
}

function getTaskPresets(department) {
  let tasks = listAll(SHEETS.TASKPRESETS).filter(t => t.active);
  if (department) tasks = tasks.filter(t => t.department === department);
  return tasks;
}

function getRunningTimer(email) {
  const entries = listAll(SHEETS.TIMEENTRIES);
  const running = entries.find(e => e.employee_email === email && !e.end_time);
  return running || null;
}

function startTimer(params) {
  const existing = getRunningTimer(params.email);
  if (existing) return { error: 'Timer already running for this user', entry: existing };

  const project = listAll(SHEETS.PROJECTS).find(p => p.project_id === params.project_id);
  const employee = listAll(SHEETS.EMPLOYEES).find(e => e.email.toLowerCase() === String(params.email).toLowerCase());
  
  const entryId = Utilities.getUuid().slice(0, 8);
  const row = {
    entry_id: entryId,
    employee_email: params.email,
    project_id: params.project_id,
    project_name: project ? project.project_name : '',
    department: employee ? employee.department : (project ? project.department : ''),
    task_description: params.task_description || '',
    start_time: new Date().toISOString(),
    end_time: '',
    duration_minutes: ''
  };
  getSheet(SHEETS.TIMEENTRIES).appendRow(HEADERS.TimeEntries.map(h => row[h]));
  return { success: true, entry_id: entryId };
}

function stopTimer(params) {
  const rowIndex = findRowIndex(SHEETS.TIMEENTRIES, 'entry_id', params.entry_id);
  if (rowIndex === -1) return { error: 'Entry not found' };
  const sheet = getSheet(SHEETS.TIMEENTRIES);
  const headers = HEADERS.TimeEntries;
  const startTime = new Date(sheet.getRange(rowIndex, headers.indexOf('start_time') + 1).getValue());
  const endTime = new Date();
  const durationMinutes = Math.round((endTime - startTime) / 60000);
  sheet.getRange(rowIndex, headers.indexOf('end_time') + 1).setValue(endTime.toISOString());
  sheet.getRange(rowIndex, headers.indexOf('duration_minutes') + 1).setValue(durationMinutes);
  return { success: true, duration_minutes: durationMinutes };
}

function getEmployeeDashboardData(params) {
  const email = params.email;
  if (!email) return { error: 'Email is required' };

  const allEntries = listAll(SHEETS.TIMEENTRIES)
    .filter(e => e.employee_email.toLowerCase() === email.toLowerCase());

  const completedEntries = allEntries.filter(e => e.end_time);

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

  completedEntries.forEach(e => {
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

  // Sort completed entries by start_time descending initially
  completedEntries.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  return {
    week_hours: (weekMinutes / 60).toFixed(2),
    month_hours: (monthMinutes / 60).toFixed(2),
    entries: completedEntries.slice(0, 50)
  };
}

function updateTimeEntry(params) {
  const email = params.email;
  const entryId = params.entry_id;
  const newDuration = Number(params.new_duration_minutes);

  if (!email) return { error: 'Email is required' };
  if (!entryId) return { error: 'Entry ID is required' };
  if (isNaN(newDuration) || newDuration < 0) return { error: 'Invalid duration' };

  // Fetch all completed entries for this employee to check if this entry is one of the last 4
  const allEntries = listAll(SHEETS.TIMEENTRIES)
    .filter(e => e.employee_email.toLowerCase() === email.toLowerCase() && e.end_time);

  // Sort descending by start_time so latest is first
  allEntries.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  const editableEntries = allEntries.slice(0, 4);
  const originalEntry = editableEntries.find(e => e.entry_id === entryId);

  if (!originalEntry) {
    return { error: 'You can only edit your last 4 completed entries.' };
  }

  const originalDuration = Number(originalEntry.duration_minutes) || 0;
  if (newDuration > originalDuration) {
    return { error: 'You can only reduce the duration of an entry, not increase it.' };
  }

  const startTime = new Date(originalEntry.start_time);
  if (isNaN(startTime.getTime())) {
    return { error: 'Invalid start time in original entry.' };
  }

  // Recalculate end_time: start_time + newDuration minutes
  const newEndTime = new Date(startTime.getTime() + newDuration * 60000);

  const rowIndex = findRowIndex(SHEETS.TIMEENTRIES, 'entry_id', entryId);
  if (rowIndex === -1) return { error: 'Entry not found' };

  const sheet = getSheet(SHEETS.TIMEENTRIES);
  const headers = HEADERS.TimeEntries;

  sheet.getRange(rowIndex, headers.indexOf('end_time') + 1).setValue(newEndTime.toISOString());
  sheet.getRange(rowIndex, headers.indexOf('duration_minutes') + 1).setValue(newDuration);

  return { success: true };
}

function getReport(params) {
  let entries = listAll(SHEETS.TIMEENTRIES).filter(e => e.end_time); // completed entries only

  if (params.employee_email) {
    entries = entries.filter(e => e.employee_email === params.employee_email);
  }
  if (params.project_id) {
    const projectIds = String(params.project_id).split(',').map(id => id.trim());
    entries = entries.filter(e => projectIds.includes(e.project_id));
  }
  if (params.department) {
    entries = entries.filter(e => e.department === params.department);
  }
  if (params.start_date) {
    const start = new Date(params.start_date);
    entries = entries.filter(e => new Date(e.start_time) >= start);
  }
  if (params.end_date) {
    const end = new Date(params.end_date);
    end.setHours(23, 59, 59, 999);
    entries = entries.filter(e => new Date(e.start_time) <= end);
  }

  const totalMinutes = entries.reduce((sum, e) => sum + (Number(e.duration_minutes) || 0), 0);

  // Group by employee
  const byEmployee = {};
  entries.forEach(e => {
    byEmployee[e.employee_email] = (byEmployee[e.employee_email] || 0) + Number(e.duration_minutes || 0);
  });

  // Group by project
  const byProject = {};
  entries.forEach(e => {
    byProject[e.project_name] = (byProject[e.project_name] || 0) + Number(e.duration_minutes || 0);
  });

  return {
    total_hours: (totalMinutes / 60).toFixed(2),
    by_employee: Object.entries(byEmployee).map(([email, min]) => ({ email, hours: (min / 60).toFixed(2) })),
    by_project: Object.entries(byProject).map(([project, min]) => ({ project, hours: (min / 60).toFixed(2) })),
    entries: entries
  };
}

// ---------- AUTOMATION & TRIGGERS ----------

function setupAutomationTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  
  // Nightly email trigger at 8 PM (local time of script owner)
  ScriptApp.newTrigger('sendForgottenTimerEmails')
    .timeBased()
    .everyDays(1)
    .atHour(20)
    .create();
    
  // Archiving check trigger: runs on the 1st of every month at 1 AM
  ScriptApp.newTrigger('archiveOldEntries')
    .timeBased()
    .onMonthDay(1)
    .atHour(1)
    .create();

  return { success: true };
}

function archiveOldEntries() {
  // Only execute archiving operations in January (Month index 0)
  if (new Date().getMonth() !== 0) {
    return { success: true, archived_count: 0, reason: 'Archiving skipped (only runs in January)' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timeEntriesSheet = ss.getSheetByName(SHEETS.TIMEENTRIES);
  if (!timeEntriesSheet) return { error: 'TimeEntries sheet not found' };
  
  const values = timeEntriesSheet.getDataRange().getValues();
  if (values.length <= 1) return { success: true, archived_count: 0 }; // Only headers or empty
  
  const headers = values[0];
  const startTimeCol = headers.indexOf('start_time');
  if (startTimeCol === -1) return { error: 'start_time column not found' };
  
  const currentYear = new Date().getFullYear();
  const currentYearRows = [headers];
  const rowsByYear = {};
  let archivedCount = 0;
  
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const startTimeStr = row[startTimeCol];
    if (!startTimeStr) {
      currentYearRows.push(row);
      continue;
    }
    
    let year = null;
    try {
      const date = new Date(startTimeStr);
      year = date.getFullYear();
    } catch (e) {
      // Ignore parse errors, keep in main sheet
    }
    
    if (year && year < currentYear) {
      if (!rowsByYear[year]) {
        rowsByYear[year] = [];
      }
      rowsByYear[year].push(row);
      archivedCount++;
    } else {
      currentYearRows.push(row);
    }
  }
  
  // Write old entries to their respective yearly tabs
  for (const year in rowsByYear) {
    const tabName = `TimeEntries_${year}`;
    let yearSheet = ss.getSheetByName(tabName);
    if (!yearSheet) {
      yearSheet = ss.insertSheet(tabName);
      yearSheet.appendRow(HEADERS.TimeEntries);
      yearSheet.setFrozenRows(1);
    }
    const rowsToWrite = rowsByYear[year];
    const startRow = yearSheet.getLastRow() + 1;
    yearSheet.getRange(startRow, 1, rowsToWrite.length, headers.length).setValues(rowsToWrite);
  }
  
  // Overwrite the main sheet with current year entries
  timeEntriesSheet.clearContent();
  timeEntriesSheet.getRange(1, 1, currentYearRows.length, headers.length).setValues(currentYearRows);
  
  return { success: true, archived_count: archivedCount };
}

function sendForgottenTimerEmails() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timeEntries = listAll(SHEETS.TIMEENTRIES);
  const employees = listAll(SHEETS.EMPLOYEES);
  
  const openEntries = timeEntries.filter(e => !e.end_time);
  if (openEntries.length === 0) return { success: true, emails_sent: 0 };
  
  let emailsSent = 0;
  openEntries.forEach(entry => {
    const email = entry.employee_email;
    const employee = employees.find(emp => emp.email.toLowerCase() === email.toLowerCase() && emp.active);
    if (!employee) return; // Inactive or not found
    
    const startTime = new Date(entry.start_time);
    const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = startTime.toLocaleDateString();
    
    const subject = `Forgot to stop your timer? — Company Time Tracker`;
    const message = `Hi ${employee.name},\n\n` +
      `Our records show you started a timer for project "${entry.project_name || 'Unknown'}" ` +
      `with task description "${entry.task_description || 'No description'}" ` +
      `at ${timeStr} on ${dateStr}, but it hasn't been stopped yet.\n\n` +
      `Please open the Time Tracker extension popup to stop your timer or edit your time entry manually.\n\n` +
      `Best regards,\nCompany Time Tracker`;
      
    try {
      MailApp.sendEmail(email, subject, message);
      emailsSent++;
    } catch (err) {
      console.error(`Failed to send email to ${email}: ${err.message}`);
    }
  });
  
  return { success: true, emails_sent: emailsSent };
}

