/**
 * Clockroach Google Sheets Secure Backend API
 * 
 * Instructions:
 * 1. Open your Google Sheet
 * 2. Click Extensions > Apps Script
 * 3. Delete any default code and paste this code in
 * 4. Click Deploy > New deployment
 * 5. Choose Select type > Web app
 * 6. Set "Execute as" to "Me" (your admin email)
 * 7. Set "Who has access" to "Anyone"
 * 8. Click Deploy, authorize permissions, and copy the Web App URL!
 */

function doGet(e) {
  try {
    const table = e.parameter.table;
    if (!table) {
      throw new Error('Table parameter is required');
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(table);
    if (!sheet) {
      throw new Error('Table "' + table + '" not found in spreadsheet');
    }
    
    const data = getSheetData(sheet);
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const table = payload.table;
    const data = payload.data;
    
    if (!action || !table) {
      throw new Error('Missing action or table parameter');
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(table);
    if (!sheet) {
      throw new Error('Table "' + table + '" not found in spreadsheet');
    }
    
    let result = null;
    if (action === 'insert') {
      result = insertRow(sheet, data);
    } else if (action === 'update') {
      result = updateRow(sheet, payload.queryCol, payload.queryVal, data, payload.rowNum);
    } else if (action === 'delete') {
      result = deleteRow(sheet, payload.queryCol, payload.queryVal, payload.rowNum);
    } else {
      throw new Error('Unsupported action: ' + action);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --- Helper Functions ---

function getSheetData(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  
  const headers = values[0];
  const rows = [];
  
  for (let i = 1; i < values.length; i++) {
    const row = {};
    row._rowNum = i + 1; // 1-indexed for the sheet (excluding headers)
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[i][j];
    }
    rows.push(row);
  }
  return rows;
}

function insertRow(sheet, data) {
  const headers = sheet.getDataRange().getValues()[0];
  const row = headers.map(h => data[h] !== undefined ? data[h] : '');
  sheet.appendRow(row);
  return data;
}

function updateRow(sheet, queryCol, queryVal, data, rowNum) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  
  let targetRowIndex = -1;
  
  if (rowNum && !isNaN(rowNum)) {
    targetRowIndex = Number(rowNum);
  } else if (queryCol) {
    const colIndex = headers.indexOf(queryCol);
    if (colIndex === -1) {
      throw new Error('Query column "' + queryCol + '" not found');
    }
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][colIndex]) === String(queryVal)) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }
  
  if (targetRowIndex < 2 || targetRowIndex > values.length) {
    throw new Error('Record not found or invalid row index: ' + targetRowIndex);
  }
  
  for (let j = 0; j < headers.length; j++) {
    if (data[headers[j]] !== undefined) {
      sheet.getRange(targetRowIndex, j + 1).setValue(data[headers[j]]);
    }
  }
  return data;
}

function deleteRow(sheet, queryCol, queryVal, rowNum) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  
  let targetRowIndex = -1;
  
  if (rowNum && !isNaN(rowNum)) {
    targetRowIndex = Number(rowNum);
  } else if (queryCol) {
    const colIndex = headers.indexOf(queryCol);
    if (colIndex === -1) {
      throw new Error('Query column "' + queryCol + '" not found');
    }
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][colIndex]) === String(queryVal)) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }
  
  if (targetRowIndex < 2 || targetRowIndex > values.length) {
    throw new Error('Record not found or invalid row index: ' + targetRowIndex);
  }
  
  sheet.deleteRow(targetRowIndex);
  return true;
}
