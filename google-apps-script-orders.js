// Google Apps Script bound to the order spreadsheet.
// Script Property required: ORDERS_ACCESS_TOKEN
// Set it to the same secret as the dashboard's GOOGLE_SHEET_ACCESS_TOKEN.

const ORDER_HEADERS = [
  'timestamp', 'orderId', 'status', 'customerName', 'phone', 'product',
  'unitPrice', 'quantity', 'city', 'address', 'total', 'notes', 'rawJson',
];

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  if (!isAuthorized_(params.token)) return json_({ success: false, error: 'غير مصرح.' });
  if (params.action !== 'list') return json_({ success: false, error: 'عملية غير معروفة.' });

  const sheet = getOrderSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2 || !String(values[0][0] || '').trim()) {
    return json_({ success: true, orders: [] });
  }

  const headers = values[0].map(String);
  const hasArabicHeader = values.length > 2 && isDisplayHeader_(values[1]);
  const displayHeaders = hasArabicHeader ? values[1].map(String) : [];
  const idColumn = headers.indexOf('orderId');

  const orders = values.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    if (isDisplayHeader_(row)) return null;

    // Older rows use the teal Arabic labels in row 2; newer rows have a UUID in orderId.
    const legacy = hasArabicHeader && rowNumber > 2 && !isUuid_(row[idColumn]);
    const rowHeaders = legacy ? displayHeaders : headers;
    const order = { rowNumber };

    rowHeaders.forEach((header, column) => {
      const field = canonicalField_(header) || header;
      const value = row[column] instanceof Date ? row[column].toISOString() : row[column];
      if (value !== '' && value != null) order[field] = value;
    });

    if (legacy) order.legacy = true;
    const dashboardStatusColumn = headers.indexOf('dashboardStatus');
    if (legacy && dashboardStatusColumn >= 0 && row[dashboardStatusColumn]) {
      order.status = row[dashboardStatusColumn];
    }
    return order;
  }).filter(order => order && (order.customerName || order.phone || order.product));

  return json_({ success: true, orders });
}

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return json_({ success: false, error: 'شغّل Web app عبر طلب HTTP؛ التشغيل اليدوي لا يمرر بيانات الطلب.' });
  }

  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (_) {
    return json_({ success: false, error: 'صيغة الطلب غير صالحة.' });
  }

  const sheet = getOrderSheet_();
  if (data.action === 'update') return updateOrderStatus_(sheet, data, e);

  const incoming = data.order || data.data || data;
  ensureHeaders_(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const order = normalizeOrder_(incoming);
  const row = headers.map(header => {
    if (header === 'rawJson') return JSON.stringify(incoming);
    const canonical = canonicalField_(header);
    return (canonical && order[canonical] !== undefined) ? order[canonical] : (incoming[header] ?? '');
  });

  sheet.appendRow(row);
  return json_({ success: true });
}

function updateOrderStatus_(sheet, data, e) {
  if (!isAuthorized_(data.token || (e.parameter && e.parameter.token))) {
    return json_({ success: false, error: 'غير مصرح.' });
  }

  const rowNumber = Number(data.rowNumber);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    return json_({ success: false, error: 'رقم الطلب غير صالح.' });
  }

  const allValues = sheet.getDataRange().getValues();
  const headers = allValues[0].map(String);
  const idColumn = headers.indexOf('orderId');
  const legacy = allValues.length > 2 && isDisplayHeader_(allValues[1]) && !isUuid_(allValues[rowNumber - 1][idColumn]);
  const statusHeader = legacy ? 'dashboardStatus' : 'status';
  let statusColumn = headers.indexOf(statusHeader) + 1;
  if (!statusColumn) {
    statusColumn = sheet.getLastColumn() + 1;
    sheet.getRange(1, statusColumn).setValue(statusHeader);
  }

  sheet.getRange(rowNumber, statusColumn).setValue(String(data.status || ''));
  return json_({ success: true });
}

function normalizeOrder_(incoming) {
  const result = {};
  Object.keys(incoming || {}).forEach(key => {
    const field = canonicalField_(key);
    if (field && incoming[key] !== '' && incoming[key] != null && result[field] === undefined) {
      result[field] = incoming[key];
    }
  });

  result.timestamp = result.timestamp || new Date().toISOString();
  result.orderId = result.orderId || Utilities.getUuid();
  result.status = result.status || 'جديد';
  return result;
}

function ensureHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0 || !String(sheet.getRange(1, 1).getValue() || '').trim()) {
    sheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
    return;
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const missing = ORDER_HEADERS.filter(header => !headers.includes(header));
  if (missing.length) {
    sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
  }
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
    unitPrice: ['unitprice', 'price', 'سعر الوحدة', 'السعر'],
    quantity: ['quantity', 'qty', 'الكمية'],
    city: ['city', 'province', 'المدينة', 'الولاية'],
    address: ['address', 'العنوان'],
    total: ['total', 'grandtotal', 'ordertotal', 'الإجمالي', 'المجموع', 'السعر الإجمالي'],
    notes: ['notes', 'note', 'ملاحظات'],
  };

  for (const field in aliases) {
    if (aliases[field].includes(key)) return field;
  }
  return '';
}

function isDisplayHeader_(row) {
  const fields = row.map(value => canonicalField_(value));
  return fields.includes('timestamp') && fields.includes('customerName') && fields.includes('phone');
}

function isUuid_(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function getOrderSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const configuredName = PropertiesService.getScriptProperties().getProperty('ORDERS_SHEET_NAME');
  const sheetName = configuredName ? configuredName.trim() : spreadsheet.getSheets()[0]?.getName();
  const sheet = sheetName ? spreadsheet.getSheetByName(sheetName) : null;
  if (!sheet) throw new Error('عيّن ORDERS_SHEET_NAME باسم ورقة الطلبات في Script Properties.');
  return sheet;
}

function isAuthorized_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('ORDERS_ACCESS_TOKEN');
  return Boolean(expected && token && String(token).trim() === expected.trim());
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
