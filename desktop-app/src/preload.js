'use strict';
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('desktopApp', Object.freeze({isDesktop:true,platform:process.platform,version:process.versions.electron}));
