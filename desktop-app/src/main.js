'use strict';
const {app,BrowserWindow,dialog,shell}=require('electron');
const path=require('path');
const {createLocalServer}=require('./local-server');
let server,mainWindow;
async function createWindow(){
  server=await createLocalServer({dataDir:path.join(app.getPath('userData'),'data'),publicDir:path.join(__dirname,'public')});
  mainWindow=new BrowserWindow({width:1440,height:920,minWidth:1024,minHeight:700,show:false,icon:path.join(__dirname,'public','icon-512.png'),backgroundColor:'#f5f7fa',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/i.test(url))shell.openExternal(url);return{action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(server.origin)){event.preventDefault();shell.openExternal(url);}});
  await mainWindow.loadURL(server.origin); mainWindow.show();
}
const hasLock=app.requestSingleInstanceLock();
if(!hasLock)app.quit();
else app.whenReady().then(()=>{app.setAppUserModelId('com.alsalman.hr.desktop');return createWindow();}).catch(error=>{dialog.showErrorBox('تعذّر تشغيل النظام',error.stack||String(error));app.quit();});
app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{if(server)server.close();});
