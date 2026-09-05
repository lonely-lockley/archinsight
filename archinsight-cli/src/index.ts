#!/usr/bin/env node

import { helpText, parseArgs } from "./cli-arguments.js";
import { CliError } from "./cli-error.js";
import {
  runEnvironments,
  runLink,
  runQuery,
  runRender,
  runSkill,
  runStructure,
} from "./commands.js";
import { version } from "./version.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) {
    process.stdout.write(`${version}\n`);
    return;
  }
  if (args.help || args.command === undefined) {
    process.stdout.write(helpText());
    return;
  }

  switch (args.command) {
    case "link":
      await runLink(args);
      return;
    case "render":
      await runRender(args);
      return;
    case "query":
      await runQuery(args);
      return;
    case "structure":
      await runStructure(args);
      return;
    case "environments":
      await runEnvironments(args);
      return;
    case "skill":
      await runSkill(args);
      return;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof CliError || error instanceof Error ? error.message : String(error);
  process.stderr.write(`ERROR\tCLI\t-\t0\t0\t${message.replaceAll(/\s+/g, " ").trim()}\n`);
  process.exitCode = 1;
});
