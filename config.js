// ---------- DEFAULT CONFIGURATION (OPTIONAL) ----------
// Pre-configure connection details here so your employees can skip the database setup screen.
const DEFAULT_BACKEND = ''; // Options: '', 'sheets', 'supabase'
const DEFAULT_SUPABASE_URL = ''; // Your Supabase URL
const DEFAULT_SUPABASE_ANON_KEY = ''; // Your Supabase Anon Key

// ---------- GOOGLE API CONNECTOR LAYER ----------

const GoogleAPI = {
  // 1. Obtain Google OAuth token
  getAuthToken: function(interactive = true) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: interactive }, function(token) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!token) {
          reject(new Error('Failed to obtain auth token.'));
        } else {
          resolve(token);
        }
      });
    });
  },

  // 2. Discover spreadsheet in user's Google Drive
  findSpreadsheet: async function(token) {
    const q = encodeURIComponent("name = 'Clockroach Time Tracker' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`;
    
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Failed to search Google Drive.');
    }
    
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  },

  // 3. Create pre-formatted spreadsheet from scratch
  createSpreadsheet: async function(token, userEmail) {
    const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    
    // Create the blank sheet
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: { title: 'Clockroach Time Tracker' }
      })
    });
    
    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(err.error?.message || 'Failed to create spreadsheet.');
    }
    
    const sheetData = await createRes.json();
    const spreadsheetId = sheetData.spreadsheetId;
    
    // Google Sheets automatically creates "Sheet1" by default. 
    // We will batch-add our target sheets and then delete "Sheet1" to keep it clean.
    const defaultSheetId = sheetData.sheets?.[0]?.properties?.sheetId || 0;
    
    const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const batchRes = await fetch(batchUpdateUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          { addSheet: { properties: { title: 'Employees' } } },
          { addSheet: { properties: { title: 'Departments' } } },
          { addSheet: { properties: { title: 'Projects' } } },
          { addSheet: { properties: { title: 'TaskPresets' } } },
          { addSheet: { properties: { title: 'TimeEntries' } } },
          { deleteSheet: { sheetId: defaultSheetId } }
        ]
      })
    });
    
    if (!batchRes.ok) {
      const err = await batchRes.json();
      throw new Error(err.error?.message || 'Failed to initialize sheets.');
    }
    
    // Write standard headers and populate initial default/admin values
    const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
    const valuesRes = await fetch(valuesUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          // Headers
          { range: 'Employees!A1:F1', values: [['employee_id', 'email', 'name', 'department', 'role', 'active']] },
          { range: 'Departments!A1:C1', values: [['department_id', 'department_name', 'parent_department']] },
          { range: 'Projects!A1:D1', values: [['project_id', 'project_name', 'department', 'active']] },
          { range: 'TaskPresets!A1:D1', values: [['task_id', 'task_name', 'department', 'active']] },
          { range: 'TimeEntries!A1:I1', values: [['entry_id', 'employee_email', 'project_id', 'project_name', 'department', 'task_description', 'start_time', 'end_time', 'duration_minutes']] },
          
          // Seed Data
          { range: 'Employees!A2:F2', values: [['E1', userEmail || 'admin@yourcompany.com', 'Admin Owner', 'Development', 'admin', true]] },
          { range: 'Departments!A2:C4', values: [['D1', 'Development', ''], ['D2', 'Marketing', ''], ['D3', 'Sales', '']] },
          { range: 'Projects!A2:D3', values: [['P1', 'Project Alpha', 'Development, Marketing', true], ['P2', 'Project Beta', 'Development', true]] },
          { range: 'TaskPresets!A2:C4', values: [['T1', 'Research', 'Development'], ['T2', 'Coding', 'Development'], ['T3', 'Design', 'Development']] }
        ]
      })
    });
    
    if (!valuesRes.ok) {
      const err = await valuesRes.json();
      throw new Error(err.error?.message || 'Failed to populate sheet headers.');
    }
    
    return spreadsheetId;
  },

  // 4. Read all rows in a sheet and parse them into clean JSON objects
  listAll: async function(spreadsheetId, token, sheetName) {
    const range = `${sheetName}!A:Z`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Failed to read sheet ${sheetName}.`);
    }
    
    const data = await res.json();
    const rows = data.values || [];
    if (rows.length <= 1) return [];
    
    const headers = rows[0];
    return rows.slice(1).map((row, index) => {
      const obj = {};
      obj._rowNum = index + 2; // Store 1-indexed sheet row index (skipping header)
      headers.forEach((h, colIndex) => {
        obj[h] = row[colIndex] !== undefined ? row[colIndex] : '';
      });
      return obj;
    });
  },

  // 5. Append a row to a sheet
  appendRow: async function(spreadsheetId, token, sheetName, headersList, rowDataObj) {
    const range = `${sheetName}!A1`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
    
    // Map the key-value object to sequential array matching headers list
    const rowValues = headersList.map(h => rowDataObj[h] !== undefined ? rowDataObj[h] : '');
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [rowValues]
      })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Failed to append row to ${sheetName}.`);
    }
    
    return true;
  },

  // 6. Update values on a specific row
  updateRow: async function(spreadsheetId, token, sheetName, headersList, rowNum, rowDataObj) {
    const range = `${sheetName}!A${rowNum}:Z${rowNum}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    
    const rowValues = headersList.map(h => rowDataObj[h] !== undefined ? rowDataObj[h] : '');
    
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [rowValues]
      })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Failed to update row ${rowNum} in ${sheetName}.`);
    }
    
    return true;
  },

  // 7. Get sheetId mapping (required for deletions)
  getSheetId: async function(spreadsheetId, token, sheetName) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title,sheetId))`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    const sheet = data.sheets?.find(s => s.properties?.title === sheetName);
    return sheet ? sheet.properties.sheetId : null;
  },

  // 8. Delete a row using deleteDimension REST request
  deleteRow: async function(spreadsheetId, token, sheetName, rowNum) {
    const sheetId = await this.getSheetId(spreadsheetId, token, sheetName);
    if (sheetId === null) {
      throw new Error(`Sheet ${sheetName} not found in metadata.`);
    }
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const zeroBasedIndex = rowNum - 1; // Translate sheet row number to 0-based index
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: zeroBasedIndex,
                endIndex: zeroBasedIndex + 1
              }
            }
          }
        ]
      })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Failed to delete row ${rowNum} from ${sheetName}.`);
    }
    
    return true;
  }
};

const SupabaseAPI = {
  // 1. Sign in with email and password
  signIn: async function(url, key, email, password) {
    const signInUrl = `${url}/auth/v1/token?grant_type=password`;
    const res = await fetch(signInUrl, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error_description || err.error?.message || 'Failed to sign in.');
    }
    
    return await res.json();
  },

  // 2. Sign up with email, password, name, and department
  signUp: async function(url, key, email, password, name, department) {
    // 2.a Sign up in Supabase Auth
    const signUpUrl = `${url}/auth/v1/signup`;
    const res = await fetch(signUpUrl, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error_description || err.error?.message || 'Failed to sign up.');
    }
    
    const signupData = await res.json();
    const token = signupData.access_token;
    
    if (!token) {
      throw new Error('Sign up successful, but auto-login is disabled. Please ask your administrator to verify your email and activate your account.');
    }

    // 2.b Verify employee in public.employees table
    let employees = [];
    try {
      employees = await this.listAll(url, key, token, 'employees');
    } catch (e) {
      console.error('Failed to query employees table', e);
    }

    const emailLower = email.toLowerCase();
    const existingEmp = employees.find(e => e.email.toLowerCase() === emailLower);

    // Initial project setup: if there are no employee records, make them Admin Owner
    if (employees.length === 0) {
      const employeeId = Math.random().toString(36).substring(2, 10);
      const newEmp = {
        employee_id: employeeId,
        email: email,
        name: name || 'Admin Owner',
        department: department || 'Development',
        role: 'admin',
        active: true
      };
      await this.insertRow(url, key, token, 'employees', newEmp);
      return { token, employee: newEmp };
    }

    if (!existingEmp) {
      throw new Error('Your email has not been added to this workspace. Please contact your administrator.');
    }

    const isActive = existingEmp.active === true || existingEmp.active === 'true' || existingEmp.active === 'TRUE';
    if (!isActive) {
      throw new Error('Your account is inactive. Please contact your administrator.');
    }

    // If a name was entered and it differs, update it in the database
    if (name && name.trim() && existingEmp.name !== name.trim()) {
      try {
        existingEmp.name = name.trim();
        await this.updateRow(url, key, token, 'employees', 'email', email, { name: name.trim() });
      } catch (e) {
        console.error('Failed to update employee name in DB', e);
      }
    }

    return { token, employee: existingEmp };
  },

  // 3. Get all rows in a table
  listAll: async function(url, key, token, table, queryParams = '') {
    let listUrl = `${url}/rest/v1/${table}?select=*`;
    if (queryParams) {
      listUrl += `&${queryParams}`;
    }
    
    const res = await fetch(listUrl, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `Failed to fetch data from ${table}.`);
    }
    
    return await res.json();
  },

  // 4. Insert row into table
  insertRow: async function(url, key, token, table, rowObj) {
    const insertUrl = `${url}/rest/v1/${table}`;
    const res = await fetch(insertUrl, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(rowObj)
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `Failed to insert record into ${table}.`);
    }
    
    return await res.json();
  },

  // 5. Update row in table
  updateRow: async function(url, key, token, table, queryCol, queryVal, rowObj) {
    const updateUrl = `${url}/rest/v1/${table}?${queryCol}=eq.${encodeURIComponent(queryVal)}`;
    const res = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(rowObj)
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `Failed to update record in ${table}.`);
    }
    
    return await res.json();
  },

  // 6. Delete row from table
  deleteRow: async function(url, key, token, table, queryCol, queryVal) {
    const deleteUrl = `${url}/rest/v1/${table}?${queryCol}=eq.${encodeURIComponent(queryVal)}`;
    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `Failed to delete record from ${table}.`);
    }
    
    return true;
  }
};

