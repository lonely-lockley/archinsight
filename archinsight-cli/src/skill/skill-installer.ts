import { mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "../cli-error.js";
import type { SkillPackage } from "./skill-package.js";

export interface SkillInstallOptions {
  readonly projectRoot: string;
  readonly output?: string;
  readonly force: boolean;
}

export async function installSkillPackage(
  skillPackage: SkillPackage,
  options: SkillInstallOptions,
): Promise<string> {
  const projectRoot = path.resolve(options.projectRoot);
  const usesDefaultOutput = options.output === undefined;
  const outputRoot = path.resolve(projectRoot, options.output ?? skillPackage.defaultOutput);
  const outputExists = await exists(outputRoot);

  if (outputExists && !options.force) {
    throw new CliError(
      `Refusing to initialize skill because output directory '${outputRoot}' already exists. `
      + "Pass --force to replace the complete generated skill package.",
    );
  }
  if (options.force) {
    assertSafeSkillOutputRoot(projectRoot, outputRoot);
  }

  const outputParent = path.dirname(outputRoot);
  await mkdir(outputParent, { recursive: true });
  const stagingRoot = await mkdtemp(path.join(outputParent, `.${path.basename(outputRoot)}.tmp-`));
  let previousRoot: string | undefined;
  let installed = false;
  try {
    for (const file of skillPackage.files) {
      await writeGeneratedFile(path.join(stagingRoot, file.path), file.content);
    }

    if (!options.force && await exists(outputRoot)) {
      throw new CliError(
        `Refusing to initialize skill because output directory '${outputRoot}' was created concurrently. `
        + "No generated files were installed.",
      );
    }
    if (options.force && await exists(outputRoot)) {
      previousRoot = `${stagingRoot}.previous`;
      await rename(outputRoot, previousRoot);
    }
    try {
      await rename(stagingRoot, outputRoot);
      installed = true;
    } catch (error) {
      if (previousRoot !== undefined && !await exists(outputRoot)) {
        await rename(previousRoot, outputRoot);
        previousRoot = undefined;
      }
      throw error;
    }
    if (previousRoot !== undefined) {
      await rm(previousRoot, { recursive: true, force: true });
      previousRoot = undefined;
    }
  } finally {
    if (!installed) {
      await rm(stagingRoot, { recursive: true, force: true });
    }
    if (installed && previousRoot !== undefined && await exists(previousRoot)) {
      await rm(previousRoot, { recursive: true, force: true });
    }
  }

  return skillPackageSuccess(projectRoot, outputRoot, skillPackage, usesDefaultOutput);
}

function assertSafeSkillOutputRoot(projectRoot: string, outputRoot: string): void {
  if (outputRoot === path.parse(outputRoot).root || outputRoot === process.cwd() || outputRoot === projectRoot) {
    throw new CliError(`Refusing to delete unsafe skill output directory '${outputRoot}'. Choose a dedicated --out directory.`);
  }
  const projectRelativeToOutput = path.relative(outputRoot, projectRoot);
  if (projectRelativeToOutput !== "" && !projectRelativeToOutput.startsWith("..") && !path.isAbsolute(projectRelativeToOutput)) {
    throw new CliError(`Refusing to delete skill output directory '${outputRoot}' because it contains the project root.`);
  }
}

async function writeGeneratedFile(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function skillPackageSuccess(
  projectRoot: string,
  outputRoot: string,
  skillPackage: SkillPackage,
  usesDefaultOutput: boolean,
): string {
  const lines = [
    `Generated ${skillPackage.target} Archinsight agent guide: ${displayPath(process.cwd(), outputRoot)}`,
    "",
  ];
  if (skillPackage.target === "generic") {
    lines.push("Next steps:");
    lines.push(`  1. Share ${displayPath(projectRoot, path.join(outputRoot, skillPackage.entrypoint))} with your AI agent.`);
    lines.push("  2. Ask the agent to validate Insight edits with: archinsight link . --format text");
    lines.push("  3. Keep project-specific conventions near the generated guide or pass them in the prompt.");
  } else if (skillPackage.installedByDefault && usesDefaultOutput) {
    lines.push(`Notice: restart the ${skillPackage.target} session so the Archinsight skill is discovered.`);
  } else if (skillPackage.target === "codex") {
    lines.push("Next steps:");
    lines.push(`  1. Install or copy ${displayPath(projectRoot, outputRoot)} as the archinsight skill in your Codex skills directory.`);
    lines.push("  2. Invoke it explicitly as $archinsight when editing Insight .ai models.");
    lines.push("  3. Ask Codex to validate Insight edits with: archinsight link . --format text");
  } else {
    lines.push("Next steps:");
    lines.push(`  1. Import or copy ${displayPath(projectRoot, outputRoot)} into your Claude skill runtime.`);
    lines.push("  2. Ask Claude to use the Archinsight skill before editing Insight .ai models.");
    lines.push("  3. Validate Insight edits with: archinsight link . --format text");
  }
  lines.push("");
  return lines.join("\n");
}

function displayPath(from: string, target: string): string {
  const relative = path.relative(from, target);
  if (relative === "") {
    return ".";
  }
  return relative.startsWith("..") || path.isAbsolute(relative) ? target : relative;
}
