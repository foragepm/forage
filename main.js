const os = require('os')
const {app, Menu, Tray, shell} = require('electron')
const path = require('path')
const createServer = require('./lib/server')
const forage = require('./lib/forage')

const assetsDirectory = path.join(__dirname, 'assets')

app.setAboutPanelOptions({
  applicationName: 'Forage',
  applicationVersion: forage.core.forageVersion(),
  copyright: 'Andrew Nesbitt',
  version: forage.core.forageVersion(),
  website: 'http://forage.pm',
  iconPath: path.join(assetsDirectory, 'forage.png')
})

var tray = undefined
var win = undefined
var db
var started = false

if(os.platform() === 'darwin'){
  // Don't show the app in the doc
  app.dock.hide()
}

app.on('ready', () => {
  console.log('ready')
  db = forage.connectDB()
  createTray()
  startServer(db)
})

async function startServer() {
  var ipfsID = await forage.connectIPFS(db);
  if (ipfsID) {
    server = await createServer(db)
    server.listen(8005)
    // TODO decide on which packages to download via IPFS when announced (all or only versions of existing ones)
    forage.subscribePackageAnnoucements()
    forage.watchKnown();
    forage.periodicUpdate();
    started = true
    updateStatusMenu()
    tray.setImage(path.join(assetsDirectory, 'forageTemplate.png'))
  }
}

function stopServer() {
  console.log('stopping')
  server.close();
  forage.core.unsubscribePackageAnnoucements(forage.packageAnnoucementsTopic)
  started = false
  updateStatusMenu()
  tray.setImage(path.join(assetsDirectory, 'forageoffTemplate.png'))
}

function updateStatusMenu() {
  contextMenu.getMenuItemById('running').visible = started
  contextMenu.getMenuItemById('stop').visible = started
  contextMenu.getMenuItemById('stopped').visible = !started
  contextMenu.getMenuItemById('start').visible = !started
}

const contextMenu = Menu.buildFromTemplate([
  { id: 'running', label: 'Status: Running', type: 'normal', enabled: false },
  { id: 'stopped', label: 'Status: Stopped', type: 'normal', enabled: false },
  { label: 'Port: 8005', type: 'normal', enabled: false, },
  { id: 'start', label: 'Start', type: 'normal', click: startServer },
  { id: 'stop', label: 'Stop', type: 'normal', click: stopServer },
  { label: 'Settings', submenu: [
    { id: 'config', label: 'Apply proxy config', type: 'normal', click: forage.setConfig },
    { id: 'unconfig', label: 'Remove proxy config', type: 'normal', click: forage.unsetConfig }
  ] },
  { label: 'About', type: 'normal', role: 'about' },
  { label: 'Help', type: 'normal', click: openGitHub },
  { label: 'Quit', type: 'normal', role: 'quit', accelerator: 'Command+Q' } // TODO no accelerator on windows/linux
])

const createTray = () => {
  tray = new Tray(path.join(assetsDirectory, 'forageoffTemplate.png'))

  tray.setToolTip('Forage Package Manager Proxy')
  tray.setContextMenu(contextMenu)
}

function openGitHub() {
  shell.openExternal('https://github.com/foragepm/forage')
}

// function createWindow () {
//   win = new BrowserWindow({
//     width: 800,
//     height: 600,
//     webPreferences: {
//       nodeIntegration: true
//     }
//   })
//
//   win.loadFile('index.html')
// }
//
// const toggleWindow = () => {
//   if (win.isVisible()) {
//     win.hide()
//   } else {
//     showWindow()
//   }
// }
//
// const showWindow = () => {
//   // const position = getWindowPosition()
//   // win.setPosition(position.x, position.y, false)
//   win.show()
//   win.focus()
// }

// app.whenReady().then(createWindow)

// app.on('window-all-closed', () => {
//   if (process.platform !== 'darwin') {
//     app.quit()
//   }
// })

// app.on('activate', () => {
//   if (BrowserWindow.getAllWindows().length === 0) {
//     createWindow()
//   }
// })
