#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BENCHMARK_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT = path.join(BENCHMARK_ROOT, "generated", "company-250");
const GENERATOR_ID = "archinsight-link-scaling-v1";
const DEFAULT_SERVICE_COUNT = 250;
const ENVIRONMENT_COUNT = 15;
const COMPONENTS_PER_CONTAINER = 8;

const options = parseArguments(process.argv.slice(2));
const outputRoot = path.resolve(options.output ?? DEFAULT_OUTPUT);
const serviceCount = options.services ?? DEFAULT_SERVICE_COUNT;

if (!Number.isInteger(serviceCount) || serviceCount < 10 || serviceCount > DEFAULT_SERVICE_COUNT) {
  throw new Error(`--services must be an integer between 10 and ${DEFAULT_SERVICE_COUNT}`);
}

await prepareOutputDirectory(outputRoot);

const contexts = allocateContexts(serviceCount);
const serviceToContext = new Map(
  contexts.flatMap((context) => context.services.map((service) => [service, context])),
);
const files = [];

await emit("definitions/deployment.ai", deploymentDefinitions());
for (let environment = 1; environment <= ENVIRONMENT_COUNT; environment += 1) {
  await emit(`environments/env-${pad(environment, 2)}.ai`, environmentSource(environment));
}

for (const context of contexts) {
  for (const service of context.services) {
    const serviceDirectory = `contexts/${context.id}/service-${pad(service, 3)}`;
    const targets = interactionTargets(service, context, contexts);
    await emit(`${serviceDirectory}/model.ai`, serviceSource(service, context, targets), service);
    await emit(`${serviceDirectory}/components/web.ai`, componentSource(service, context, "web"), service);
    await emit(`${serviceDirectory}/components/api.ai`, componentSource(service, context, "api"), service);
    await emit(`${serviceDirectory}/components/worker.ai`, componentSource(service, context, "worker"), service);
  }
}

const manifest = {
  generator: GENERATOR_ID,
  schemaVersion: 4,
  generatedAt: new Date().toISOString(),
  serviceCount,
  environmentCount: ENVIRONMENT_COUNT,
  contextCount: contexts.length,
  componentsPerService: COMPONENTS_PER_CONTAINER * 3,
  containersPerService: 3,
  deploymentProfilesPerService: 2,
  contexts: contexts.map((context) => ({
    id: context.id,
    name: context.name,
    serviceCount: context.services.length,
    services: context.services.map((service) => `service_${pad(service, 3)}`),
  })),
  files,
  totals: {
    files: files.length,
    lines: files.reduce((sum, file) => sum + file.lines, 0),
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  },
};

await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputRoot, ...manifest.totals, contexts: contexts.length }, null, 2));

async function emit(relativePath, source, serviceIndex = null) {
  const normalizedSource = source.endsWith("\n") ? source : `${source}\n`;
  const destination = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, normalizedSource, "utf8");
  files.push({
    path: relativePath,
    serviceIndex,
    lines: normalizedSource.split("\n").length - 1,
    bytes: Buffer.byteLength(normalizedSource),
  });
}

async function prepareOutputDirectory(directory) {
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
    if (manifest.generator !== GENERATOR_ID) {
      throw new Error(`Refusing to replace '${directory}': its manifest belongs to another generator`);
    }
    await rm(directory, { recursive: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(directory, { recursive: true });
}

function allocateContexts(totalServices) {
  const preferredSizes = [6, 9, 4, 8, 3, 10, 5, 7];
  const sizes = [];
  let remaining = totalServices;
  let cursor = 0;
  while (remaining > 10) {
    let size = Math.min(preferredSizes[cursor % preferredSizes.length], remaining - 3);
    if (remaining - size > 0 && remaining - size < 3) size -= 3 - (remaining - size);
    sizes.push(size);
    remaining -= size;
    cursor += 1;
  }
  if (remaining > 0) sizes.push(remaining);
  if (sizes.some((size) => size < 3 || size > 10)) {
    throw new Error(`Context allocation violated the 3..10 service constraint: ${sizes.join(", ")}`);
  }

  let nextService = 1;
  return sizes.map((size, index) => {
    const contextNumber = index + 1;
    const services = Array.from({ length: size }, () => nextService++);
    return {
      id: `context_${pad(contextNumber, 3)}`,
      name: `Business Context ${pad(contextNumber, 3)}`,
      services,
    };
  });
}

function interactionTargets(service, context, contexts) {
  const position = context.services.indexOf(service);
  const contextIndex = contexts.indexOf(context);
  const candidates = [];

  if (position > 0) candidates.push(context.services[position - 1]);
  if (position > 1) candidates.push(context.services[0]);
  if (contextIndex > 0) {
    const previousContext = contexts[contextIndex - 1];
    candidates.push(previousContext.services.at(-1));
  }
  if (contextIndex > 2 && service % 3 === 0) {
    const earlierContext = contexts[contextIndex - 3];
    candidates.push(earlierContext.services[service % earlierContext.services.length]);
  }

  return [...new Set(candidates.filter((target) => target !== undefined))].map((target) => ({
    service: target,
    context: serviceToContext.get(target),
  }));
}

function deploymentDefinitions() {
  return `# Shared deployment vocabulary for the synthetic company benchmark.

define type BenchmarkService of System
    constructor application
        kind = internal

extend type Environment
    Compute compute
    Storage storage
    InfrastructureComponent observability
    NetworkConnection ingress
`;
}

function environmentSource(environment) {
  const id = pad(environment, 2);
  return `environment env_${id}
    name = Environment ${id}
    region = region-${id}

deployment production
    compute:
        compute compute
            name = Kubernetes ${id}
            technology = Kubernetes

    storage:
        storage storage
            name = PostgreSQL ${id}
            technology = PostgreSQL
            runsOn:
                compute
            route:
                $from originalLink $this

    observability:
        infrastructureComponent observability
            name = Observability ${id}
            technology = OpenTelemetry
            runsOn:
                compute

    ingress:
        networkConnection ingress
            name = Service ingress ${id}
            technology = HTTPS
            runsOn:
                compute

route serviceCall
    outbound:
        $from originalLink $to
`;
}

function serviceSource(service, context, targets) {
  const id = pad(service, 3);
  const imports = targets
    .map((target) => `import api_${pad(target.service, 3)} from context ${target.context.id}`)
    .join("\n");
  const contextName = context.services[0] === service ? `\n    name = ${context.name}` : "";
  const links = targets.length === 0
    ? ""
    : `\n        links:\n${targets.map((target, index) => relationship(target.service, service, index)).join("\n")}`;

  return `context ${context.id}${contextName}
${imports === "" ? "" : `\n${imports}\n`}
deploymentProfile service_${id}_stateless
    appliesTo:
${environmentApplications()}

    runsOn compute
    uses observability

deploymentProfile service_${id}_stateful
    appliesTo:
${environmentApplications()}

    runsOn compute
    uses storage
    uses observability

application service_${id}
    name = Business Service ${id}
    technology = TypeScript, Node.js, PostgreSQL
    description = Synthetic service ${id} in ${context.name}

    container web_${id}
        name = Web ${id}
        technology = SvelteKit, TypeScript
        description = Browser-facing UI for service ${id}
        deployment:
            uses service_${id}_stateless

    service api_${id}
        name = API ${id}
        technology = Node.js, REST
        description = Synchronous API for service ${id}
        deployment:
            uses service_${id}_stateless${links}

    service worker_${id}
        name = Worker ${id}
        technology = Node.js, Kafka
        description = Stateful background processing for service ${id}
        deployment:
            uses service_${id}_stateful
`;
}

function environmentApplications() {
  return Array.from(
    { length: ENVIRONMENT_COUNT },
    (_, index) => `        production from env_${pad(index + 1, 2)}`,
  ).join("\n");
}

function relationship(targetService, sourceService, relationshipIndex) {
  const targetId = pad(targetService, 3);
  const asynchronous = (sourceService + relationshipIndex) % 4 === 0;
  if (asynchronous) {
    return `            ~> api_${targetId}
                technology = Kafka
                via = service-events
                description = Publishes an event to service ${targetId}
                deployment:
                    route serviceCall`;
  }
  return `            -> api_${targetId}
                technology = HTTPS, REST
                call = GET /v1/resources
                description = Calls service ${targetId}
                deployment:
                    route serviceCall`;
}

function componentSource(service, context, container) {
  const id = pad(service, 3);
  const componentIds = Array.from(
    { length: COMPONENTS_PER_CONTAINER },
    (_, index) => `${container}_${id}_component_${pad(index + 1, 2)}`,
  );
  const constructor = container === "web" ? "container" : "service";
  const nextContainer = container === "web" ? "api" : container === "api" ? "worker" : undefined;

  const components = componentIds.map((componentId, index) => {
    const localTarget = componentIds[index + 1];
    const crossTarget = index === componentIds.length - 1 && nextContainer !== undefined
      ? `${nextContainer}_${id}_component_01`
      : undefined;
    const linkTarget = localTarget ?? crossTarget;
    const links = linkTarget === undefined
      ? ""
      : `\n        links:\n            -> ${linkTarget}${crossTarget === undefined ? "" : ` from ${context.id}`}\n                technology = In-process`;
    return `    component ${componentId}
        name = ${title(container)} component ${pad(index + 1, 2)} for ${id}
        technology = TypeScript
        responsibility = Handles ${container} responsibility ${pad(index + 1, 2)} for service ${id}${links}`;
  }).join("\n\n");

  return `context ${context.id}

extend ${constructor} ${container}_${id}

${components}
`;
}

function title(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function pad(value, width) {
  return String(value).padStart(width, "0");
}

function parseArguments(arguments_) {
  const parsed = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--output") parsed.output = requiredValue(arguments_, ++index, argument);
    else if (argument === "--services") parsed.services = Number(requiredValue(arguments_, ++index, argument));
    else throw new Error(`Unknown argument '${argument}'`);
  }
  return parsed;
}

function requiredValue(arguments_, index, option) {
  const value = arguments_[index];
  if (value === undefined || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}
