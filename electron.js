const { app, BrowserWindow } = require('electron');
const path = require('path');
const dotenv = require('dotenv');

// Carrega as variáveis de ambiente antes de tudo
dotenv.config({ path: path.join(__dirname, '.env') });

// O require abaixo inicia o seu servidor Express (server.js) e inicializa o banco.
// Como o seu server.js possui "app.listen(PORT)", o servidor Express
// ficará rodando no background dentro do processo principal do Electron.
require('./server.js');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Controle de Estoque",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // O Express demora um tempinho rápido para conectar ao Supabase e liberar a porta.
  // Aguardamos 1500ms para garantir que a API já está de pé e então acessamos o site local.
  setTimeout(() => {
    const port = process.env.PORT || 5000;
    mainWindow.loadURL(`http://localhost:${port}`);
  }, 1500);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
