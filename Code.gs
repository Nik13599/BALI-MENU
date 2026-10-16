// ============================================
// FOOD ORDERING SYSTEM - GOOGLE APPS SCRIPT
// ============================================

// IMPORTANT: Replace with your actual Spreadsheet ID, or leave as is if script is bound to the sheet
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';

// Sheet names - must match exactly
const SHEETS = {
  CONFIG: 'Config',
  MENU: 'Menu',
  ORDERS: 'Orders',
  ORDER_ITEMS: 'OrderItems'
};

function getSpreadsheet() {
  try {
    if (SPREADSHEET_ID === 'YOUR_SPREADSHEET_ID') {
      return SpreadsheetApp.getActiveSpreadsheet();
    }
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    // Fallback to active if checking ID fails
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

// ============================================
// SETUP FUNCTION (Run this once)
// ============================================

function setupDatabase() {
  throw new Error('Старый setupDatabase отключён: он очищал листы и добавлял тестовые заказы. Настройте безопасный сервер по AUTH_SETUP.md.');
}

// ============================================
// MAIN ENTRY POINTS
// ============================================

function doGet(e) {
  const path = e.parameter.path || '';
  
  try {
    // Enable CORS
    const output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);
    
    let response = {};
    
    // Route GET requests
    switch(path) {
      case 'config':
        response = getConfig();
        break;
      case 'menu':
        response = getMenuItems();
        break;
      case 'order':
        response = { success: false, error: 'Просмотр чужого заказа по номеру без авторизации отключён' };
        break;
      case 'orders':
        // Admin only - verify token
        const token = e.parameter.token;
        if (verifyAdminToken(token)) {
          response = getAllOrders();
        } else {
          response = { success: false, error: 'Unauthorized' };
        }
        break;
      default:
        response = { success: false, error: 'Invalid path' };
    }
    
    output.setContent(JSON.stringify(response));
    return output;
    
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const path = params.path || '';
    
    let response = {};
    
    // Route POST requests
    switch(path) {
      case 'admin/login':
        response = verifyAdminPassword(params.password);
        break;
      case 'order/create':
        response = {success:false,error:'Google authentication is not yet configured'};
        break;
      case 'order/update':
        // Admin only
        if (verifyAdminToken(params.token)) {
          response = updateOrder(params);
        } else {
          response = { success: false, error: 'Unauthorized' };
        }
        break;
      case 'menu/create':
        if (verifyAdminToken(params.token)) {
          response = createMenuItem(params);
        } else {
          response = { success: false, error: 'Unauthorized' };
        }
        break;
      case 'menu/update':
        if (verifyAdminToken(params.token)) {
          response = updateMenuItem(params);
        } else {
          response = { success: false, error: 'Unauthorized' };
        }
        break;
      case 'menu/delete':
        if (verifyAdminToken(params.token)) {
          response = deleteMenuItem(params.itemId);
        } else {
          response = { success: false, error: 'Unauthorized' };
        }
        break;
      case 'config/update':
        if (verifyAdminToken(params.token)) {
          response = updateConfig(params);
        } else {
          response = { success: false, error: 'Unauthorized' };
        }
        break;
      default:
        response = { success: false, error: 'Invalid path' };
    }
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// CONFIG FUNCTIONS
// ============================================

function getConfig() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.CONFIG);
    const data = sheet.getDataRange().getValues();
    
    const config = {};
    
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      const key = data[i][0];
      const value = data[i][1];
      
      // Don't send admin_password to client
      if (key !== 'admin_password') {
        config[key] = value;
      }
    }
    
    return { success: true, config: config };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateConfig(params) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.CONFIG);
    const data = sheet.getDataRange().getValues();
    
    const updates = params.updates || {};
    
    for (let key in updates) {
      let found = false;
      
      // Find and update existing key
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === key) {
          sheet.getRange(i + 1, 2).setValue(updates[key]);
          found = true;
          break;
        }
      }
      
      // Add new key if not found
      if (!found) {
        sheet.appendRow([key, updates[key], '']);
      }
    }
    
    return { success: true, message: 'Config updated' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

function verifyAdminPassword(password) { return {success:false,error:'Secure admin authentication must be configured'}; }
function verifyAdminToken(token) { return false; }

// ============================================
// MENU FUNCTIONS
// ============================================

function getMenuItems() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.MENU);
    const data = sheet.getDataRange().getValues();
    
    const items = [];
    
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) { // Has ID
        items.push({
          id: data[i][0],
          name: data[i][1],
          description: data[i][2],
          price: parseFloat(data[i][3]) || 0,
          category: data[i][4],
          image_url: data[i][5],
          available: data[i][6] === true || data[i][6] === 'TRUE'
        });
      }
    }
    
    return { success: true, items: items };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function createMenuItem(params) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.MENU);
    
    // Get next ID
    const data = sheet.getDataRange().getValues();
    let maxId = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] > maxId) maxId = data[i][0];
    }
    const newId = maxId + 1;
    
    sheet.appendRow([
      newId,
      params.name || '',
      params.description || '',
      params.price || 0,
      params.category || '',
      params.image_url || '',
      params.available !== false // Default true
    ]);
    
    return { success: true, id: newId, message: 'Menu item created' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateMenuItem(params) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.MENU);
    const data = sheet.getDataRange().getValues();
    
    // Find item by ID
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == params.id) {
        // Update fields
        if (params.name !== undefined) sheet.getRange(i + 1, 2).setValue(params.name);
        if (params.description !== undefined) sheet.getRange(i + 1, 3).setValue(params.description);
        if (params.price !== undefined) sheet.getRange(i + 1, 4).setValue(params.price);
        if (params.category !== undefined) sheet.getRange(i + 1, 5).setValue(params.category);
        if (params.image_url !== undefined) sheet.getRange(i + 1, 6).setValue(params.image_url);
        if (params.available !== undefined) sheet.getRange(i + 1, 7).setValue(params.available);
        
        return { success: true, message: 'Menu item updated' };
      }
    }
    
    return { success: false, error: 'Item not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function deleteMenuItem(itemId) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.MENU);
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == itemId) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Menu item deleted' };
      }
    }
    
    return { success: false, error: 'Item not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ============================================
// ORDER FUNCTIONS
// ============================================

function createOrder(params) {
  try {
    const ss = getSpreadsheet();
    const ordersSheet = ss.getSheetByName(SHEETS.ORDERS);
    const itemsSheet = ss.getSheetByName(SHEETS.ORDER_ITEMS);
    
    // Generate order ID
    const orderId = 'ORD' + new Date().getTime();
    const orderDate = new Date();
    
    // Add to Orders sheet
    ordersSheet.appendRow([
      orderId,
      orderDate,
      params.customer_name || '',
      params.customer_phone || '',
      params.delivery_address || '',
      JSON.stringify(params.items || []),
      params.total_amount || 0,
      'pending',
      params.notes || ''
    ]);
    
    // Add to OrderItems sheet
    const items = params.items || [];
    items.forEach(item => {
      itemsSheet.appendRow([
        orderId,
        item.id,
        item.name,
        item.quantity,
        item.price
      ]);
    });
    
    return { 
      success: true, 
      order_id: orderId,
      message: 'Order placed successfully'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getOrderById(orderId) {
  try {
    const ss = getSpreadsheet();
    const ordersSheet = ss.getSheetByName(SHEETS.ORDERS);
    const data = ordersSheet.getDataRange().getValues();
    
    // Find order
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === orderId) {
        const order = {
          order_id: data[i][0],
          order_date: data[i][1],
          customer_name: data[i][2],
          customer_phone: data[i][3],
          delivery_address: data[i][4],
          items: JSON.parse(data[i][5] || '[]'),
          total_amount: parseFloat(data[i][6]) || 0,
          status: data[i][7] || 'pending',
          notes: data[i][8] || ''
        };
        
        return { success: true, order: order };
      }
    }
    
    return { success: false, error: 'Order not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getAllOrders() {
  try {
    const ss = getSpreadsheet();
    const ordersSheet = ss.getSheetByName(SHEETS.ORDERS);
    const data = ordersSheet.getDataRange().getValues();
    
    const orders = [];
    
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) { // Has order ID
        orders.push({
          order_id: data[i][0],
          order_date: data[i][1],
          customer_name: data[i][2],
          customer_phone: data[i][3],
          delivery_address: data[i][4],
          items: JSON.parse(data[i][5] || '[]'),
          total_amount: parseFloat(data[i][6]) || 0,
          status: data[i][7] || 'pending',
          notes: data[i][8] || ''
        });
      }
    }
    
    // Sort by date descending (newest first)
    orders.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
    
    return { success: true, orders: orders };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateOrder(params) {
  try {
    const ss = getSpreadsheet();
    const ordersSheet = ss.getSheetByName(SHEETS.ORDERS);
    const data = ordersSheet.getDataRange().getValues();
    
    // Find order
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === params.order_id) {
        // Update all editable fields
        if (params.customer_name !== undefined) ordersSheet.getRange(i + 1, 3).setValue(params.customer_name);
        if (params.customer_phone !== undefined) ordersSheet.getRange(i + 1, 4).setValue(params.customer_phone);
        if (params.delivery_address !== undefined) ordersSheet.getRange(i + 1, 5).setValue(params.delivery_address);
        if (params.items !== undefined) ordersSheet.getRange(i + 1, 6).setValue(JSON.stringify(params.items));
        if (params.total_amount !== undefined) ordersSheet.getRange(i + 1, 7).setValue(params.total_amount);
        if (params.status !== undefined) ordersSheet.getRange(i + 1, 8).setValue(params.status);
        if (params.notes !== undefined) ordersSheet.getRange(i + 1, 9).setValue(params.notes);
        
        // If items were updated, update OrderItems sheet too
        if (params.items !== undefined) {
          const itemsSheet = ss.getSheetByName(SHEETS.ORDER_ITEMS);
          const itemsData = itemsSheet.getDataRange().getValues();
          
          // Delete existing items for this order
          for (let j = itemsData.length - 1; j >= 1; j--) {
            if (itemsData[j][0] === params.order_id) {
              itemsSheet.deleteRow(j + 1);
            }
          }
          
          // Add updated items
          params.items.forEach(item => {
            itemsSheet.appendRow([
              params.order_id,
              item.id,
              item.name,
              item.quantity,
              item.price
            ]);
          });
        }
        
        return { success: true, message: 'Order updated' };
      }
    }
    
    return { success: false, error: 'Order not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ============================================
// TEST FUNCTION
// ============================================

function testAPI() {
  Logger.log('Testing Config...');
  Logger.log(getConfig());
  
  Logger.log('Testing Menu...');
  Logger.log(getMenuItems());
  
  Logger.log('Testing Admin Login...');
  Logger.log(verifyAdminPassword('NOT_CONFIGURED'));
}
