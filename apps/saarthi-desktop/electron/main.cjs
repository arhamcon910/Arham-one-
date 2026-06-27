const { app, BrowserWindow } = require("electron");

console.log("Electron Main Process Started");

function createWindow() {
  console.log("Creating Browser Window...");

  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.openDevTools();

  console.log("Loading React App...");

  win.loadURL("http://localhost:5173");

  win.webContents.on("did-finish-load", () => {
    console.log("React App Loaded Successfully");
  });

  win.on("closed", () => {
    console.log("Window Closed");
  });
}

app.whenReady().then(() => {
  console.log("Electron Ready");
  createWindow();
});

app.on("window-all-closed", () => {
  console.log("All Windows Closed");

  if (process.platform !== "darwin") {
    app.quit();
  }
});