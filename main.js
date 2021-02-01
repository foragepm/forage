const os = require('os')
const {app, Menu, Tray, shell} = require('electron')
const path = require('path')
const server = require('./lib/server')
const forest = require('./lib/forest')

const assetsDirectory = path.join(__dirname, 'assets')

app.setAboutPanelOptions({
  applicationName: 'Forest',
  applicationVersion: forest.version(),
  copyright: 'Andrew Nesbitt',
  version: forest.version(),
  website: 'http://forest.pm',
  iconPath: path.join(assetsDirectory, 'forest.png')
})

var tray = undefined
var win = undefined
var started = false

if(os.platform() === 'darwin'){
  // Don't show the app in the doc
  app.dock.hide()
}

app.on('ready', () => {
  console.log('ready')
  forest.connectDB()
  createTray()
  startServer()
})

async function startServer() {
  var ipfsID = await forest.connectIPFS();
  if (ipfsID) {
    server.listen(8005);
    // TODO decide on which packages to download via IPFS when announced (all or only versions of existing ones)
    forest.subscribePackageAnnoucements()
    forest.watchKnown();
    started = true
    updateStatusMenu()
    tray.setImage(path.join(assetsDirectory, 'forestTemplate.png'))
  }
}

function stopServer() {
  console.log('stopping')
  server.close();
  forest.unsubscribePackageAnnoucements()
  started = false
  updateStatusMenu()
  tray.setImage(path.join(assetsDirectory, 'forestoffTemplate.png'))
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
    { id: 'config', label: 'Apply proxy config', type: 'normal', click: forest.npm.setConfig },
    { id: 'unconfig', label: 'Remove proxy config', type: 'normal', click: forest.npm.removeConfig }
  ] },
  { label: 'About', type: 'normal', role: 'about' },
  { label: 'Help', type: 'normal', click: openGitHub },
  { label: 'Quit', type: 'normal', role: 'quit', accelerator: 'Command+Q' } // TODO no accelerator on windows/linux
])

const createTray = () => {
  tray = new Tray(path.join(assetsDirectory, 'forestoffTemplate.png'))

  tray.setToolTip('Forest Package Manager Proxy')
  tray.setContextMenu(contextMenu)
}

function openGitHub() {
  shell.openExternal('https://github.com/forestpm/forest')
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
