import * as fs from 'fs';
import path from 'path'
import type { UserConfigFn } from 'vite'
import { overrideVaadinConfig } from './vite.generated';
import settings from './build/vaadin-dev-server-settings.json';
import { spawn } from 'child_process';

const devBundle = !!process.env.devBundle;
const frontendBundleFolder = path.resolve(__dirname, settings.frontendBundleOutput);
const devBundleFolder = path.resolve(__dirname, settings.devBundleOutput);
const buildOutputFolder = devBundle ? devBundleFolder : frontendBundleFolder;

const customConfig: UserConfigFn = (env) => ({
  plugins: [
     {
        name: 'prebuild-commands',
        buildStart: async () => {
          spawn(path.join(__dirname, '../gradlew'), ['antlr', 'webWorkers'], { stdio: 'inherit' });
          console.log("Generated antlr parser and web workers to " + path.join(__dirname, 'frontend/generated'));
        }
    },
    {
      name: 'postbuild-commands',
      closeBundle: async () => {
        fs.copyFile(path.join(__dirname, 'frontend/generated/workers/editor.worker.js'), buildOutputFolder + '/editor.worker.js', (err) => { if (err) throw err; });
        fs.copyFile(path.join(__dirname, 'frontend/generated/workers/insight.worker.js'), buildOutputFolder + '/insight.worker.js', (err) => { if (err) throw err; });
        console.log("Copied workers to " + buildOutputFolder);
      }
    },
  ]
});

export default overrideVaadinConfig(customConfig);
