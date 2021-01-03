const {app, Menu, Tray} = require('electron')
const path = require('path')
const proxy = require('./lib/proxy')
const forest = require('./lib/forest')

const assetsDirectory = path.join(__dirname, 'assets')

app.setAboutPanelOptions({
  applicationName: 'Forest',
  applicationVersion: '0.0.1',
  copyright: 'Andrew Nesbitt',
  version: '0.0.1',
  website: 'http://forest.pm',
  iconPath: path.join(assetsDirectory, 'forest.png')
})

let tray = undefined
let win = undefined
let started = false

// Don't show the app in the doc
app.dock.hide()

app.on('ready', () => {
  console.log('ready')
  createTray()
  startServer()
})

function startServer() {
  proxy.listen(8005);
  // TODO decide on which packages to download via IPFS when announced (all or only versions of existing ones)
  forest.subscribePackageAnnoucements()
  started = true
  updateStatusMenu()
}

function stopServer() {
  proxy.close();
  forest.unsubscribePackageAnnoucements()
  started = false
  updateStatusMenu()
}

function updateStatusMenu() {
  contextMenu.getMenuItemById('running').visible = started
  contextMenu.getMenuItemById('stop').visible = started
  contextMenu.getMenuItemById('stopped').visible = !started
  contextMenu.getMenuItemById('start').visible = !started
  console.log('started:', started)
}

const contextMenu = Menu.buildFromTemplate([
  { id: 'running', label: 'Status: Running', type: 'normal', enabled: false },
  { id: 'stopped', label: 'Status: Stopped', type: 'normal', enabled: false },
  { label: 'Port: 8005', type: 'normal', enabled: false, },
  { id: 'start', label: 'Start', type: 'normal', click: startServer },
  { id: 'stop', label: 'Stop', type: 'normal', click: stopServer },
  { label: 'About', type: 'normal', role: 'about' },
  { label: 'Quit', type: 'normal', role: 'quit', accelerator: 'Command+Q' } // TODO no accelerator on windows/linux
])

const createTray = () => {
  tray = new Tray(path.join(assetsDirectory, 'forestTemplate.png'))

  tray.setToolTip('This is my application.')
  tray.setContextMenu(contextMenu)
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
