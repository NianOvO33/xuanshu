'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 渲染层只拿到一个受限的聊天方法，不暴露 Node 能力
contextBridge.exposeInMainWorld('xuanshuAI', {
  chat: (payload) => ipcRenderer.invoke('ai:chat', payload)
});
