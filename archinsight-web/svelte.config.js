import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const contextRoot = normalizeContextRoot(
  process.env.VITE_ARCHINSIGHT_CONTEXT_ROOT ?? process.env.ARCHINSIGHT_CONTEXT_ROOT ?? localContextRoot() ?? '/'
);

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    }),
    paths: {
      base: contextRoot
    }
  }
};

export default config;

function normalizeContextRoot(value) {
  if (value === undefined || value === null) {
    return '';
  }
  let normalized = String(value).trim();
  if (normalized === '' || normalized === '/') {
    return '';
  }
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function localContextRoot() {
  const configuredPath = process.env.ARCHINSIGHT_LOCAL_CONFIG ?? process.env.ARCHINSIGHT_CONFIG;
  const candidates = localConfigCandidatePaths(process.cwd(), configuredPath);
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    return undefined;
  }
  const content = readFileSync(path, 'utf8');
  const archinsight = /^archinsight:\s*$/mu.exec(content);
  if (!archinsight) {
    return undefined;
  }
  const afterArchinsight = content.slice(archinsight.index + archinsight[0].length);
  const nextTopLevel = /\n\S/mu.exec(afterArchinsight);
  const block = nextTopLevel ? afterArchinsight.slice(0, nextTopLevel.index) : afterArchinsight;
  const match = /^\s{2}context-root:\s*['"]?([^'"\n]+)['"]?\s*$/mu.exec(block);
  return match?.[1]?.trim();
}

function localConfigCandidatePaths(cwd, configuredPath) {
  const candidates = [];
  if (configuredPath && configuredPath.trim() !== '') {
    candidates.push(configuredPath);
  }
  for (const directory of ancestorDirectories(cwd)) {
    candidates.push(resolve(directory, 'local/application.yaml'));
  }
  return [...new Set(candidates)];
}

function ancestorDirectories(start) {
  const directories = [];
  let current = resolve(start);
  while (true) {
    directories.push(current);
    const parent = dirname(current);
    if (parent === current) {
      return directories;
    }
    current = parent;
  }
}
