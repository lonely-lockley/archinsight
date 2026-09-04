import {
  createFolder,
  createProject,
  deleteFile,
  deleteFolder,
  deleteProject,
  fetchCurrentUser,
  fetchFile,
  fetchPlaygroundPublication,
  fetchProjects,
  fetchTree,
  linkProject,
  logoutCurrentUser,
  publishToPlayground,
  renameFile,
  renameFolder,
  renderProjectSvg,
  routePath,
  saveFile,
  unpublishFromPlayground,
  updateProject
} from '$lib/api';
import {
  clearLocalWorkspaceStorage,
  clearProjectStorage,
  hasLocalSource,
  readLocalSource,
  readProjectRegistry,
  readWorkspace,
  removeLocalSource,
  writeLocalSource,
  writeProjectRegistry,
  writeWorkspace
} from '$lib/storage';
import { renderDotInBrowser } from '$lib/graphviz-renderer';
import { sanitizeSvg } from '@archinsight/workbench/svg-sanitizer';
import { downloadBlob, downloadText, svgToPngBlob } from '$lib/workspace/diagram/download';

export const workspaceRuntimeDependencies = {
  api: {
    createFolder,
    createProject,
    deleteFile,
    deleteFolder,
    deleteProject,
    fetchCurrentUser,
    fetchFile,
    fetchPlaygroundPublication,
    fetchProjects,
    fetchTree,
    linkProject,
    logoutCurrentUser,
    publishToPlayground,
    renameFile,
    renameFolder,
    renderProjectSvg,
    routePath,
    saveFile,
    unpublishFromPlayground,
    updateProject
  },
  storage: {
    clearLocalWorkspaceStorage,
    clearProjectStorage,
    hasLocalSource,
    readLocalSource,
    readProjectRegistry,
    readWorkspace,
    removeLocalSource,
    writeLocalSource,
    writeProjectRegistry,
    writeWorkspace
  },
  diagram: {
    renderDotInBrowser,
    sanitizeSvg,
    downloadBlob,
    downloadText,
    svgToPngBlob
  }
} as const;
