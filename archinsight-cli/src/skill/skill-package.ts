import {
  BUILTIN_VIEW_DEFINITIONS,
  BUILTIN_VIEW_QUERIES,
  coreSources,
} from "@insight/language";
import { SKILL_RESOURCE_MANIFEST, SKILL_RESOURCES } from "../generated/skill-resources.js";
import { version } from "../version.js";

export type SkillTarget = keyof typeof SKILL_RESOURCE_MANIFEST.targets;

export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
}

export interface SkillPackage {
  readonly target: SkillTarget;
  readonly defaultOutput: string;
  readonly entrypoint: string;
  readonly installedByDefault: boolean;
  readonly files: readonly GeneratedFile[];
}

const VERSION_TOKEN = "{{CLI_VERSION}}";

export function skillPackage(target: SkillTarget): SkillPackage {
  const definition = SKILL_RESOURCE_MANIFEST.targets[target];
  const files = [
    ...resourceFiles(definition.resourceRoot),
    ...resourceFiles(SKILL_RESOURCE_MANIFEST.sharedRoot),
    ...dynamicLanguageFiles(),
  ];
  assertUniqueOutputPaths(files);
  return {
    target,
    defaultOutput: definition.defaultOutput,
    entrypoint: definition.entrypoint,
    installedByDefault: definition.installedByDefault,
    files,
  };
}

function resourceFiles(resourceRoot: string): readonly GeneratedFile[] {
  const prefix = `${resourceRoot}/`;
  return Object.entries(SKILL_RESOURCES)
    .filter(([resourcePath]) => resourcePath.startsWith(prefix))
    .map(([resourcePath, content]) => ({
      path: resourcePath.slice(prefix.length),
      content: content.replaceAll(VERSION_TOKEN, version),
    }));
}

function dynamicLanguageFiles(): readonly GeneratedFile[] {
  return [
    ...BUILTIN_VIEW_DEFINITIONS.map((definition) => ({
      path: `examples/builtin-views/${definition.id}.aiq`,
      content: textFileContent(definition.query),
    })),
    {
      path: "examples/queries/deployment-internal-actors.aiq",
      content: textFileContent(deploymentInternalActorsQuery()),
    },
    ...coreSources.map((source) => ({
      path: `.core/${source.sourceName.replaceAll("\\", "/").replace(/^\.\//, "")}`,
      content: textFileContent(source.source),
    })),
  ];
}

function assertUniqueOutputPaths(files: readonly GeneratedFile[]): void {
  const paths = new Set<string>();
  for (const file of files) {
    if (paths.has(file.path)) {
      throw new Error(`Skill resource manifest produces duplicate output '${file.path}'`);
    }
    paths.add(file.path);
  }
}

function textFileContent(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function deploymentInternalActorsQuery(): string {
  let query = BUILTIN_VIEW_QUERIES.deployment;
  query = replaceExactlyOnce(
    query,
    "    OR ((node IS ContainerElement OR node IS External) AND node.deployed = true))",
    "    OR ((node IS ContainerElement OR node IS External) AND node.deployed = true)\n    OR node IS Actor)",
    "Deployment internal-actor query",
  );
  query = replaceExactlyOnce(
    query,
    "   OR projectedPeer IS External)",
    "   OR projectedPeer IS External\n   OR projectedPeer IS Actor)",
    "Deployment internal-actor projected peer filter",
  );
  return query;
}

function replaceExactlyOnce(source: string, expected: string, replacement: string, description: string): string {
  const parts = source.split(expected);
  if (parts.length !== 2) {
    throw new Error(`Cannot generate ${description}: expected one matching built-in Deployment fragment, found ${parts.length - 1}`);
  }
  return `${parts[0]}${replacement}${parts[1]}`;
}
