// Paste this into Extensions > Apps Script in the same spreadsheet that receives orders.
// Set Script Property ORDERS_ACCESS_TOKEN to the same value as GOOGLE_SHEET_ACCESS_TOKEN.
const ORDERS_HEADERS = ['timestamp', 'orderId', 'status', 'customerName', 'phone', 'product', 'quantity', 'city', 'address', 'total', 'notes', 'rawJson'];

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  if (!authorized_(params.token)) return json_({ success: false, error: 'غير مصرح.' });
  if (params.action !== 'list') return json_({ success: false, error: 'عملية غير معروفة.' });
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return json_({ success: true, orders: [] });
  const headers = values[0].map(String);
  const orders = values.slice(1).map((row, index) => {
    const order = { rowNumber: index + 2 };
    headers.forEach((header, i) => { order[header] = row[i] instanceof Date ? row[i].toISOString() : row[i]; });
    return order;
  }).filter(order => Object.values(order).some(value => value !== '' && value != null));
  return json_({ success: true, orders });
}

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents || '{}'); } catch (_) { return json_({ success: false, error: 'صيغة الطلب غير صالحة.' }); }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (data.action === 'update') {
    if (!authorized_(data.token || e.parameter.token)) return json_({ success: false, error: 'غير مصرح.' });
    const row = Number(data.rowNumber);
    if (!Number.isInteger(row) || row < 2) return json_({ success: false, error: 'رقم الصف غير صالح.' });
    const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
    let statusColumn = headers.indexOf('status') + 1;
    if (!statusColumn) { statusColumn = headers.length + 1; sheet.getRange(1, statusColumn).setValue('status'); }
    sheet.getRange(row, statusColumn).setValue(String(data.status || ''));
    return json_({ success: true });
  }
  const order = data.order && typeof data.order === 'object' ? data.order : data;
  const headersRange = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1));
  let headers = headersRange.getValues()[0].map(String).filter(Boolean);
  if (!headers.length) { headers = ORDERS_HEADERS.slice(); sheet.getRange(1, 1, 1, headers.length).setValues([headers]); }
  const mapped = { ...order, timestamp: order.timestamp || new Date().toISOString(), orderId: order.orderId || order.id || Utilities.getUuid(), status: order.status || 'جديد' };
  const extras = Object.keys(mapped).filter(key => !['action', 'token'].includes(key) && !headers.includes(key));
  if (extras.length) { const start = headers.length + 1; sheet.getRange(1, start, 1, extras.length).setValues([extras]); headers = headers.concat(extras); }
  const row = headers.map(header => header === 'rawJson' ? JSON.stringify(order) : (mapped[header] ?? ''));
  sheet.appendRow(row);
  return json_({ success: true });
}

function authorized_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('ORDERS_ACCESS_TOKEN');
  return Boolean(expected && token && token === expected);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
