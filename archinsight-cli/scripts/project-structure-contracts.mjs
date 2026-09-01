import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(path.join(tmpdir(), "archinsight-cli-structure-"));
const cli = path.resolve("build/index.js");

try {
  write("definitions.ai", `
define type Module of CodeElement
    constructor module
    required Text name

extend type Component
    List of Module _
`);
  write("external.ai", `
context external

external system vendor
    name = Vendor
`);
  write("model.ai", `
context shop

import vendor from context external

system storefront
    name = Storefront

    service backend
        name = Backend

        component checkout
            name = Checkout

            module handler
                name = Handler
`);

  const structure = json("structure", root, "--format", "json");
  assert.equal(structure.schemaVersion, "project-structure.v1");
  assert(typeById(structure.types, "Module"));
  assert.equal(typeById(structure.types, "List"), undefined, "CLI policy must continue hiding List");

  const shop = structure.contexts.find((context) => context.id === "shop");
  assert(shop);
  assert.deepEqual(shop.children.map((child) => [child.kind, child.id, child.type]), [
    ["import", "vendor", "ExternalSystem"],
    ["element", "storefront", "System"],
  ]);
  assert.deepEqual(declarationPath(shop.children[1]), ["storefront", "backend", "checkout", "handler"]);

  const text = run("structure", root, "--format", "text");
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Module extends CodeElement/);
  assert.match(text.stdout, /import ExternalSystem vendor \(model\.ai:3:8\)/);
  assert.match(text.stdout, /element Module handler \(model\.ai:14:13\)/);

  console.log("CLI project structure contracts passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function write(name, content) {
  writeFileSync(path.join(root, name), content.trimStart());
}

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: path.resolve(".."),
    encoding: "utf8",
  });
}

function json(...args) {
  const result = run(...args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function declarationPath(declaration) {
  return [declaration.id, ...(declaration.children[0] === undefined ? [] : declarationPath(declaration.children[0]))];
}

function typeById(types, id) {
  for (const type of types) {
    if (type.id === id) {
      return type;
    }
    const child = typeById(type.children, id);
    if (child !== undefined) {
      return child;
    }
  }
  return undefined;
}
