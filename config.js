// ---------- DEFAULT CONFIGURATION (OPTIONAL) ----------
// Pre-configure connection details here so your employees can skip the database setup screen.
const DEFAULT_BACKEND = ''; // Options: '', 'sheets', 'supabase'
const DEFAULT_SUPABASE_URL = ''; // Your Supabase URL
const DEFAULT_SUPABASE_ANON_KEY = ''; // Your Supabase Anon Key

// ---------- GOOGLE API CONNECTOR LAYER ----------

const GoogleAPI = {
  // Test connection to the Web App URL and verify it can read sheets
  testConnection: async function(webAppUrl) {
    try {
      const url = `${webAppUrl}?table=Employees`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Connection failed. Please check your URL.');
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      return true;
    } catch (e) {
      throw new Error('Web App URL is unreachable or invalid: ' + e.message);
    }
  },

  // 1. Fetch all rows from a table
  listAll: async function(webAppUrl, token, sheetName) {
    const actualSheetName = sheetName || token;
    const url = `${webAppUrl}?table=${encodeURIComponent(actualSheetName)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch data from ${actualSheetName}.`);
    }
    const data = await res.json();
    if (data && data.error) {
      throw new Error(data.error);
    }
    return data;
  },

  // 2. Append a row to a sheet
  appendRow: async function(webAppUrl, token, sheetName, headersList, rowObj) {
    const actualSheetName = rowObj ? sheetName : token;
    const actualRowObj = rowObj || headersList || sheetName;
    
    const res = await fetch(webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'insert',
        table: actualSheetName,
        data: actualRowObj
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to append row to ${actualSheetName}.`);
    }
    const resData = await res.json();
    if (!resData.success) {
      throw new Error(resData.error || `Failed to append row to ${actualSheetName}.`);
    }
    return resData.data;
  },

  // 3. Update a row in a sheet
  updateRow: async function(webAppUrl, token, sheetName, headersList, rowNum, rowDataObj) {
    let actualSheetName, actualQueryCol, actualQueryVal, actualRowNum, actualRowDataObj;
    
    if (typeof headersList === 'number' || !isNaN(headersList)) {
      actualSheetName = token;
      actualRowNum = headersList;
      actualRowDataObj = rowNum || sheetName;
    } else if (rowDataObj !== undefined) {
      actualSheetName = sheetName;
      actualRowNum = rowNum;
      actualRowDataObj = rowDataObj;
    } else {
      actualSheetName = token;
      actualQueryCol = sheetName;
      actualQueryVal = headersList;
      actualRowDataObj = rowNum;
    }

    const res = await fetch(webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'update',
        table: actualSheetName,
        queryCol: actualQueryCol,
        queryVal: actualQueryVal,
        rowNum: actualRowNum,
        data: actualRowDataObj
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to update row in ${actualSheetName}.`);
    }
    const resData = await res.json();
    if (!resData.success) {
      throw new Error(resData.error || `Failed to update row in ${actualSheetName}.`);
    }
    return resData.data;
  },

  // 4. Delete a row from a sheet
  deleteRow: async function(webAppUrl, token, sheetName, rowNum) {
    let actualSheetName, actualQueryCol, actualQueryVal, actualRowNum;
    
    if (rowNum !== undefined) {
      actualSheetName = sheetName;
      actualRowNum = rowNum;
    } else {
      actualSheetName = token;
      actualQueryCol = sheetName;
      actualQueryVal = rowNum;
    }

    const res = await fetch(webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'delete',
        table: actualSheetName,
        queryCol: actualQueryCol,
        queryVal: actualQueryVal,
        rowNum: actualRowNum
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to delete row from ${actualSheetName}.`);
    }
    const resData = await res.json();
    if (!resData.success) {
      throw new Error(resData.error || `Failed to delete row from ${actualSheetName}.`);
    }
    return true;
  }
};

const SupabaseAPI = {
  // 1.a Refresh Supabase session token
  refreshToken: async function(url, key, refreshToken) {
    const refreshUrl = `${url}/auth/v1/token?grant_type=refresh_token`;
    const res = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error_description || err.error?.message || 'Failed to refresh token.');
    }
    
    return await res.json();
  },

  // 1.b Verify and refresh session if expiring (internal helper)
  verifyToken: async function(url, key, token) {
    try {
      const stored = await chrome.storage.local.get(['supabase_refresh_token', 'supabase_token_expiry']);
      const expiry = stored.supabase_token_expiry || 0;
      
      // If expiring in less than 2 minutes (120 seconds), refresh it
      if (stored.supabase_refresh_token && Date.now() > expiry - 120000) {
        console.log('Clockroach: Silently refreshing database token...');
        const refreshData = await this.refreshToken(url, key, stored.supabase_refresh_token);
        
        const newToken = refreshData.access_token;
        const newExpiry = Date.now() + refreshData.expires_in * 1000;
        
        await chrome.storage.local.set({
          supabase_token: newToken,
          supabase_refresh_token: refreshData.refresh_token,
          supabase_token_expiry: newExpiry
        });
        
        // Update local global variables if active in current script context
        if (typeof supabaseToken !== 'undefined') {
          supabaseToken = newToken;
        }
        
        return newToken;
      }
    } catch (err) {
      console.error('Silently refreshing token failed:', err);
    }
    return token;
  },

  // 1.c Sign in with email and password
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
      return { 
        token, 
        refresh_token: signupData.refresh_token, 
        expires_in: signupData.expires_in, 
        employee: newEmp 
      };
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

    return { 
      token, 
      refresh_token: signupData.refresh_token, 
      expires_in: signupData.expires_in, 
      employee: existingEmp 
    };
  },

  // 3. Get all rows in a table
  listAll: async function(url, key, token, table, queryParams = '') {
    const activeToken = await this.verifyToken(url, key, token);
    let listUrl = `${url}/rest/v1/${table}?select=*`;
    if (queryParams) {
      listUrl += `&${queryParams}`;
    }
    
    const res = await fetch(listUrl, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${activeToken}`,
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
    const activeToken = await this.verifyToken(url, key, token);
    const insertUrl = `${url}/rest/v1/${table}`;
    const res = await fetch(insertUrl, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${activeToken}`,
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
    const activeToken = await this.verifyToken(url, key, token);
    const updateUrl = `${url}/rest/v1/${table}?${queryCol}=eq.${encodeURIComponent(queryVal)}`;
    const res = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${activeToken}`,
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
    const activeToken = await this.verifyToken(url, key, token);
    const deleteUrl = `${url}/rest/v1/${table}?${queryCol}=eq.${encodeURIComponent(queryVal)}`;
    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${activeToken}`,
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

