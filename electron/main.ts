import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'JewelERP - Jewelry Retail Management',
    icon: path.join(__dirname, '../public/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  // Build the application menu
  const menu = Menu.buildFromTemplate([
    {
      label: '1 File',
      submenu: [
        { label: 'Company Info', click: () => navigateTo('/settings/company') },
        { type: 'separator' },
        { label: 'Backup Database', click: () => navigateTo('/settings/backup') },
        { label: 'Restore Database', click: () => navigateTo('/settings/restore') },
        { type: 'separator' },
        { label: 'Exit', role: 'quit' },
      ],
    },
    {
      label: '2 Transaction',
      submenu: [
        {
          label: 'A Sales Entry',
          submenu: [
            { label: 'A Retail Sales Entry', click: () => navigateTo('/sales/retail') },
            { label: 'B Retail Sales Return', click: () => navigateTo('/sales/return') },
            { label: 'C Sales Against Approval', click: () => navigateTo('/sales/approval') },
            { label: 'D Labour Bill', click: () => navigateTo('/sales/labour-bill') },
          ],
        },
        {
          label: 'B Purchase Entry',
          submenu: [
            { label: 'A URD Purchase Entry', click: () => navigateTo('/purchase/urd') },
            { label: 'B Regular Purchase Entry', click: () => navigateTo('/purchase/regular') },
          ],
        },
        {
          label: 'C Service Entry',
          submenu: [
            { label: 'A GST Inward Supply Entry', click: () => navigateTo('/service/inward') },
            { label: 'B GST Outward Supply Entry', click: () => navigateTo('/service/outward') },
          ],
        },
        { label: 'D Cash Bank Card Receipt Entry', click: () => navigateTo('/cash-bank/receipt') },
        { label: 'E Cash Entry', click: () => navigateTo('/cash-bank/cash') },
        { label: 'F Bank Entry', click: () => navigateTo('/cash-bank/bank') },
        { label: 'G Journal / Debit Note / Credit Note', click: () => navigateTo('/cash-bank/journal') },
        {
          label: 'H Label (SKU) Preparation Entry',
          submenu: [
            { label: 'A Label Entry', click: () => navigateTo('/inventory/labels/new') },
            { label: 'B Label List', click: () => navigateTo('/inventory/labels') },
          ],
        },
        { label: 'I Challan Entry', click: () => navigateTo('/challan') },
        { label: 'J Outsource Manufacturing', click: () => navigateTo('/manufacturing') },
        { label: 'K Customer Issue / Receipt Entry', click: () => navigateTo('/customer-issue') },
        { label: 'L Refinery Issue / Receipt Entry', click: () => navigateTo('/refinery') },
        { label: 'M Approval Issue / Receipt Entry', click: () => navigateTo('/approval') },
        { label: 'N Order Entry', click: () => navigateTo('/orders') },
        { label: 'O Repairing Entry', click: () => navigateTo('/repairing') },
        {
          label: 'P Branch Entry',
          submenu: [
            { label: 'Branch Issue', click: () => navigateTo('/branch/issue') },
            { label: 'Branch Receipt', click: () => navigateTo('/branch/receipt') },
          ],
        },
        { label: 'Q Alteration Entry', click: () => navigateTo('/alteration') },
        { label: 'R Daily Counter Stock Entry', click: () => navigateTo('/counter-stock') },
      ],
    },
    {
      label: '3 Reports',
      submenu: [
        { label: 'Daily Sales Report', click: () => navigateTo('/reports/daily-sales') },
        { label: 'Daily Purchase Report', click: () => navigateTo('/reports/daily-purchase') },
        { label: 'Stock Report', click: () => navigateTo('/reports/stock') },
        { label: 'Counter Wise Report', click: () => navigateTo('/reports/counter-wise') },
        { label: 'GST Report', click: () => navigateTo('/reports/gst') },
        { label: 'Outstanding Report', click: () => navigateTo('/reports/outstanding') },
        { label: 'Account Ledger', click: () => navigateTo('/reports/ledger') },
        { label: 'Branch Transfer Report', click: () => navigateTo('/reports/branch-transfer') },
      ],
    },
    {
      label: '4 Process',
      submenu: [
        { label: 'Metal Rate Update', click: () => navigateTo('/process/metal-rate') },
        { label: 'Label Transfer', click: () => navigateTo('/process/label-transfer') },
      ],
    },
    {
      label: '5 Housekeeping',
      submenu: [
        { label: 'Item Group Master', click: () => navigateTo('/masters/item-groups') },
        { label: 'Item Master', click: () => navigateTo('/masters/items') },
        { label: 'Purity Master', click: () => navigateTo('/masters/purities') },
        { label: 'Metal Type Master', click: () => navigateTo('/masters/metal-types') },
        { label: 'Counter Master', click: () => navigateTo('/masters/counters') },
        { label: 'Label Prefix Master', click: () => navigateTo('/masters/prefixes') },
        { label: 'Salesman Master', click: () => navigateTo('/masters/salesmen') },
        { label: 'User Management', click: () => navigateTo('/masters/users') },
      ],
    },
    {
      label: '6 CRM',
      submenu: [
        { label: 'Customer List', click: () => navigateTo('/crm/customers') },
        { label: 'Customer Ledger', click: () => navigateTo('/crm/ledger') },
        { label: 'Birthday/Anniversary', click: () => navigateTo('/crm/reminders') },
      ],
    },
    {
      label: '7 More...',
      submenu: [
        { label: 'LayAway Entry', click: () => navigateTo('/layaway') },
        { label: 'LayAway List', click: () => navigateTo('/layaway/list') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'reload' },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.maximize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function navigateTo(route: string) {
  mainWindow?.webContents.send('navigate', route);
}

// IPC handlers
ipcMain.handle('get-app-version', () => app.getVersion());

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
