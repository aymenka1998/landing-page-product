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
  const hasArabicHeader = values.length > 2 && isArabicHeaderRow_(values[1]);
  const displayHeaders = hasArabicHeader ? values[1].map(String) : [];
  const idColumn = headers.indexOf('orderId');
  const orders = values.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    if (isArabicHeaderRow_(row)) return null;
    const isLegacyRow = hasArabicHeader && rowNumber > 2 && !isUuid_(row[idColumn]);
    const sourceHeaders = isLegacyRow ? displayHeaders : headers;
    const order = { rowNumber };
    sourceHeaders.forEach((header, i) => {
      const key = canonicalField_(header) || header;
      const value = row[i] instanceof Date ? row[i].toISOString() : row[i];
      if (value !== '' && value != null) order[key] = value;
    });
    if (isLegacyRow) order.legacy = true;
    if (row[headers.indexOf('dashboardStatus') ] && isLegacyRow) order.status = row[headers.indexOf('dashboardStatus')];
    return order;
  }).filter(order => order && Object.values(order).some(value => value !== '' && value != null));
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
    const allValues = sheet.getDataRange().getValues();
    const headers = allValues[0].map(String);
    const idColumn = headers.indexOf('orderId');
    const isLegacyRow = allValues.length > 2 && isArabicHeaderRow_(allValues[1]) && !isUuid_(allValues[row - 1]?.[idColumn]);
    const statusHeader = isLegacyRow ? 'dashboardStatus' : 'status';
    let statusColumn = headers.indexOf(statusHeader) + 1;
    if (!statusColumn) { statusColumn = headers.length + 1; sheet.getRange(1, statusColumn).setValue(statusHeader); }
    sheet.getRange(row, statusColumn).setValue(String(data.status || ''));
    return json_({ success: true });
  }
  const order = data.order && typeof data.order === 'object' ? data.order : data;
  const headersRange = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1));
  let headers = headersRange.getValues()[0].map(String).filter(Boolean);
  if (!headers.length) { headers = ORDERS_HEADERS.slice(); sheet.getRange(1, 1, 1, headers.length).setValues([headers]); }
  const mapped = normalizeOrder_(order);
  const row = headers.map(header => header === 'rawJson' ? JSON.stringify(order) : (mapped[header] ?? order[header] ?? ''));
  sheet.appendRow(row);
  return json_({ success: true });
}

function normalizeOrder_(order) {
  const normalized = {};
  Object.keys(order || {}).forEach(key => {
    const field = canonicalField_(key);
    if (field && order[key] !== '' && order[key] != null && normalized[field] === undefined) normalized[field] = order[key];
  });
  normalized.timestamp = normalized.timestamp || new Date().toISOString();
  normalized.orderId = normalized.orderId || Utilities.getUuid();
  normalized.status = normalized.status || 'جديد';
  return normalized;
}

function canonicalField_(header) {
  const key = String(header || '').trim().toLowerCase();
  const aliases = {
    timestamp: ['timestamp', 'date', 'createdat', 'التاريخ', 'تاريخ الطلب'],
    orderId: ['orderid', 'id', 'رقم الطلب', 'معرف الطلب'],
    status: ['status', 'الحالة', 'حالة الطلب'],
    customerName: ['customername', 'fullname', 'name', 'customer', 'الاسم', 'اسم العميل', 'الزبون'],
    phone: ['phone', 'phonenumber', 'mobile', 'الهاتف', 'رقم الهاتف', 'رقم الهاتف/واتساب'],
    product: ['product', 'productname', 'المنتج', 'اسم المنتج'],
    quantity: ['quantity', 'qty', 'الكمية'],
    city: ['city', 'province', 'المدينة', 'الولاية'],
    address: ['address', 'العنوان'],
    total: ['total', 'grandtotal', 'ordertotal', 'الإجمالي', 'المجموع', 'السعر الإجمالي'],
    notes: ['notes', 'note', 'ملاحظات'],
  };
  for (const field in aliases) if (aliases[field].includes(key)) return field;
  return '';
}

function isArabicHeaderRow_(row) {
  const cells = row.map(value => String(value || '').trim());
  return cells.includes('التاريخ') && cells.includes('الاسم') && cells.includes('الهاتف');
}

function isUuid_(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function authorized_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('ORDERS_ACCESS_TOKEN');
  return Boolean(expected && token && token === expected);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
