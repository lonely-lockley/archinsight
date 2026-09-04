import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IndexedGraph, selectGraph } from "../build/runtime/index.js";

const result = builtinViewFixture();
const scope = { context: "shared", tab: "selected.ai" };

const cases = [
  c2MatchesExpandedDirectionalNeighborhood,
  c3MatchesExpandedDirectionalNeighborhood,
  c4MatchesExpandedDirectionalNeighborhood,
  deploymentMatchesExpandedDirectionalNeighborhood,
  noFilterMatchesExpandedDirectionalNeighborhood,
];

let failures = 0;
for (const testCase of cases) {
  try {
    testCase();
  } catch (error) {
    failures++;
    console.error(`${testCase.name} failed`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("built-in view neighborhood contracts passed");
}

function c2MatchesExpandedDirectionalNeighborhood() {
  const viewScope = { ...scope, view: "c2" };
  const expanded = selectGraph(result, viewScope, `
    MATCH (container:ContainerElement)
    WHERE container.sourceIdentity = $tab
    OPTIONAL MATCH (container)-[directOut:REFERENCES]->(directOutContainer:ContainerElement)
    OPTIONAL MATCH (directInContainer:ContainerElement)-[directIn:REFERENCES]->(container)
    OPTIONAL MATCH (container)-[derivedOut:REFERENCES {derived}]->(derivedOutContainer:ContainerElement)
    OPTIONAL MATCH (derivedInContainer:ContainerElement)-[derivedIn:REFERENCES {derived}]->(container)
    OPTIONAL MATCH (container)-[externalDirectOut:REFERENCES]->(externalDirectOutSystem:SystemElement)
    WHERE externalDirectOutSystem IS External
    OPTIONAL MATCH (externalDirectInSystem:SystemElement)-[externalDirectIn:REFERENCES]->(container)
    WHERE externalDirectInSystem IS External
    OPTIONAL MATCH (container)-[externalDerivedOut:REFERENCES {derived}]->(externalDerivedOutSystem:SystemElement)
    WHERE externalDerivedOutSystem IS External
    OPTIONAL MATCH (externalDerivedInSystem:SystemElement)-[externalDerivedIn:REFERENCES {derived}]->(container)
    WHERE externalDerivedInSystem IS External
    MATCH (boundaryContainer:ContainerElement)
    WHERE boundaryContainer = container
      OR boundaryContainer = directOutContainer
      OR boundaryContainer = directInContainer
      OR boundaryContainer = derivedOutContainer
      OR boundaryContainer = derivedInContainer
    GROUP BY boundaryContainer.parent
    RETURN boundaryContainer, directOut, directOutContainer, directIn, directInContainer,
      derivedOut, derivedOutContainer, derivedIn, derivedInContainer,
      externalDirectOut, externalDirectOutSystem, externalDirectIn, externalDirectInSystem,
      externalDerivedOut, externalDerivedOutSystem, externalDerivedIn, externalDerivedInSystem
  `);

  assertEquivalentView("c2", expanded, viewScope);
}

function c3MatchesExpandedDirectionalNeighborhood() {
  const viewScope = { ...scope, view: "c3" };
  const expanded = selectGraph(result, viewScope, `
    MATCH (container:ContainerElement)-[contains:CONTAINS]->(component:ComponentElement)
    WHERE container.sourceIdentity = $tab
    OPTIONAL MATCH (component)-[directOut:REFERENCES]->(directOutComponent:ComponentElement)
    OPTIONAL MATCH (directInComponent:ComponentElement)-[directIn:REFERENCES]->(component)
    OPTIONAL MATCH (component)-[derivedOut:REFERENCES {derived}]->(derivedOutComponent:ComponentElement)
    OPTIONAL MATCH (derivedInComponent:ComponentElement)-[derivedIn:REFERENCES {derived}]->(component)
    OPTIONAL MATCH (component)-[externalDirectOut:REFERENCES]->(externalDirectOutSystem:SystemElement)
    WHERE externalDirectOutSystem IS External
    OPTIONAL MATCH (externalDirectInSystem:SystemElement)-[externalDirectIn:REFERENCES]->(component)
    WHERE externalDirectInSystem IS External
    OPTIONAL MATCH (component)-[externalDerivedOut:REFERENCES {derived}]->(externalDerivedOutSystem:SystemElement)
    WHERE externalDerivedOutSystem IS External
    OPTIONAL MATCH (externalDerivedInSystem:SystemElement)-[externalDerivedIn:REFERENCES {derived}]->(component)
    WHERE externalDerivedInSystem IS External
    GROUP BY component.parent
    RETURN component, directOut, directOutComponent, directIn, directInComponent,
      derivedOut, derivedOutComponent, derivedIn, derivedInComponent,
      externalDirectOut, externalDirectOutSystem, externalDirectIn, externalDirectInSystem,
      externalDerivedOut, externalDerivedOutSystem, externalDerivedIn, externalDerivedInSystem
  `);

  assertEquivalentView("c3", expanded, viewScope);
}

function c4MatchesExpandedDirectionalNeighborhood() {
  const viewScope = { ...scope, view: "c4" };
  const expanded = selectGraph(result, viewScope, `
    MATCH (code:CodeElement)
    WHERE code.sourceIdentity = $tab
    OPTIONAL MATCH (code)-[outbound:REFERENCES]->(outboundCode:CodeElement)
    OPTIONAL MATCH (inboundCode:CodeElement)-[inbound:REFERENCES]->(code)
    GROUP BY code.parent
    RETURN code, outbound, outboundCode, inbound, inboundCode
  `);

  assertEquivalentView("c4", expanded, viewScope);
}

function deploymentMatchesExpandedDirectionalNeighborhood() {
  const expanded = selectGraph(result, scope, `
    MATCH (node:Element)
    WHERE node.sourceIdentity = $tab
      AND (node IS InfrastructureComponent
        OR ((node IS ContainerElement OR node IS External) AND node.deployed = true))
    OPTIONAL MATCH (deploymentTarget:InfrastructureComponent)
    WHERE deploymentTarget IN node.uses OR deploymentTarget IN node.runsOn
    OPTIONAL MATCH ROLLUP (node)-[projectedOut:REFERENCES {projected}]->(projectedOutPeer:Element)
    WHERE (projectedOutPeer IS InfrastructureComponent
       OR (projectedOutPeer IS ContainerElement AND projectedOutPeer.deployed = true)
       OR projectedOutPeer IS External)
      AND projectedOutPeer.id <> node.id
    OPTIONAL MATCH ROLLUP (projectedInPeer:Element)-[projectedIn:REFERENCES {projected}]->(node)
    WHERE (projectedInPeer IS InfrastructureComponent
       OR (projectedInPeer IS ContainerElement AND projectedInPeer.deployed = true)
       OR projectedInPeer IS External)
      AND projectedInPeer.id <> node.id
    OPTIONAL MATCH (node)-[directOut:REFERENCES]->(directOutPeer:Element)
    WHERE node IS InfrastructureComponent
      AND (directOutPeer IS InfrastructureComponent OR directOutPeer IS External)
    OPTIONAL MATCH (directInPeer:Element)-[directIn:REFERENCES]->(node)
    WHERE node IS InfrastructureComponent
      AND (directInPeer IS InfrastructureComponent OR directInPeer IS External)
    GROUP BY node.runsOn
    RETURN node, deploymentTarget, projectedOut, projectedOutPeer, projectedIn, projectedInPeer,
      directOut, directOutPeer, directIn, directInPeer
  `);

  assertEquivalentView("deployment", expanded, { ...scope, context: "shared" });
}

function noFilterMatchesExpandedDirectionalNeighborhood() {
  const expanded = selectGraph(result, { context: "shared" }, `
    MATCH (element)
    WHERE element.context = $context
    OPTIONAL MATCH (element)-[outbound:REFERENCES]->(outboundElement)
    OPTIONAL MATCH (inboundElement)-[inbound:REFERENCES]->(element)
    GROUP BY element.parent
    RETURN element, outbound, outboundElement, inbound, inboundElement
  `);

  assertEquivalentView("no-filter", expanded, { context: "shared" });
}

function assertEquivalentView(name, expanded, queryScope = scope) {
  const compact = selectGraph(result, queryScope, builtinView(name));
  assert.deepEqual(viewSignature(compact), viewSignature(expanded));
}

function viewSignature(graph) {
  return {
    elements: Object.keys(graph.elements).sort(),
    edges: graph.edges.map((item) => [
      item.source,
      item.target,
      item.derived ? "derived" : "direct",
      item.projected ? "projected" : "authored",
      item.edge.declaration?.line ?? 0,
    ].join("|")).sort(),
    groups: graph.groups.map((group) => `${group.owner}:${[...group.elements].sort().join(",")}`).sort(),
    externalElements: [...graph.externalElements].sort(),
  };
}

function builtinView(name) {
  return readFileSync(
    new URL(`../../../src/main/resources/com/github/lonelylockley/insight/builtin-views/${name}.aiq`, import.meta.url),
    "utf8",
  );
}

function builtinViewFixture() {
  const graph = new IndexedGraph();
  for (const sourceName of ["selected.ai", "peer.ai", "infra.ai"]) {
    graph.addNode({ kind: "source", id: sourceName });
  }
  for (const context of ["shared", "external", "eu"]) {
    graph.addNode({ kind: "context", id: context });
  }

  const elements = [
    element("shared", "selected_system", "System", ["SystemElement", "BoundaryElement", "Element"], "selected.ai"),
    element("shared", "selected_service", "Service", ["Container", "ContainerElement", "Element"], "selected.ai", "shared/selected_system", { deployed: true, uses: ["eu/database"] }),
    element("shared", "selected_component", "Component", ["ComponentElement", "Element"], "selected.ai", "shared/selected_service"),
    element("shared", "selected_code", "Module", ["CodeElement", "Element"], "selected.ai", "shared/selected_component"),
    element("shared", "peer_system", "System", ["SystemElement", "BoundaryElement", "Element"], "peer.ai"),
    element("shared", "peer_service", "Service", ["Container", "ContainerElement", "Element"], "peer.ai", "shared/peer_system"),
    element("shared", "peer_component", "Component", ["ComponentElement", "Element"], "peer.ai", "shared/peer_service"),
    element("shared", "peer_code", "Module", ["CodeElement", "Element"], "peer.ai", "shared/peer_component"),
    element("external", "partner", "ExternalSystem", ["System", "SystemElement", "BoundaryElement", "Element"], "peer.ai", undefined, { external: true }),
    element("external", "observer", "ExternalActor", ["Actor", "SystemElement", "BoundaryElement", "Element"], "peer.ai", undefined, { external: true, deployed: true }),
    element("eu", "compute", "Compute", ["InfrastructureComponent", "DeploymentElement", "Element"], "selected.ai"),
    element("eu", "gateway", "NetworkConnection", ["InfrastructureComponent", "DeploymentElement", "Element"], "selected.ai"),
    element("eu", "database", "Storage", ["InfrastructureComponent", "DeploymentElement", "Element"], "selected.ai"),
  ];
  for (const item of elements) {
    graph.addNode({
      kind: "element",
      id: item.id,
      context: item.context,
      localId: item.localId,
      constructor: item.constructor,
      type: item.type,
      baseTypes: item.baseTypes,
      nestingLevel: nestingLevel(item),
      declarationSource: item.sourceIdentity,
    });
  }

  const containment = [
    ["shared", "shared/selected_system"],
    ["shared/selected_system", "shared/selected_service"],
    ["shared/selected_service", "shared/selected_component"],
    ["shared/selected_component", "shared/selected_code"],
    ["shared", "shared/peer_system"],
    ["shared/peer_system", "shared/peer_service"],
    ["shared/peer_service", "shared/peer_component"],
    ["shared/peer_component", "shared/peer_code"],
    ["external", "external/partner"],
    ["external", "external/observer"],
    ["eu", "eu/compute"],
    ["eu", "eu/gateway"],
    ["eu", "eu/database"],
  ];
  containment.forEach(([source, target], index) => graph.addRelation({
    id: `contains-${index}`,
    kind: "CONTAINS",
    source,
    target,
    ownerSource: elements.find((item) => item.id === target)?.sourceIdentity ?? "selected.ai",
  }));

  const edges = [
    edge("shared/selected_service", "shared/peer_service", 10, "selected.ai"),
    edge("shared/peer_service", "shared/selected_service", 11, "peer.ai"),
    edge("external/partner", "shared/selected_service", 12, "peer.ai"),
    edge("shared/selected_component", "shared/peer_component", 20, "selected.ai"),
    edge("shared/peer_component", "shared/selected_component", 21, "peer.ai"),
    edge("external/partner", "shared/selected_component", 22, "peer.ai"),
    edge("shared/selected_code", "shared/peer_code", 30, "selected.ai"),
    edge("shared/peer_code", "shared/selected_code", 31, "peer.ai"),
    edge("external/observer", "eu/gateway", 40, "peer.ai", true),
    edge("eu/gateway", "shared/selected_service", 41, "selected.ai", true),
    edge("shared/selected_service", "eu/database", 42, "selected.ai", true),
    edge("eu/gateway", "eu/database", 43, "selected.ai"),
    edge("external/partner", "eu/gateway", 44, "peer.ai"),
  ];
  edges.forEach((item) => graph.addRelation({
    id: item.id,
    kind: "REFERENCES",
    source: item.source,
    target: item.target,
    type: item.type,
    ownerSource: item.sourceIdentity,
    ...(item.projected === true ? { projected: true } : {}),
  }));

  return {
    diagnostics: [],
    graph,
    contexts: [
      { id: "shared", type: "Context", sourceIdentity: "selected.ai", attributes: {} },
      { id: "external", type: "Context", sourceIdentity: "peer.ai", attributes: {} },
      { id: "eu", type: "Environment", sourceIdentity: "infra.ai", attributes: {} },
    ],
    elements,
    imports: [],
    edges,
    tabRoots: {
      "selected.ai": ["shared/selected_system", "eu/compute", "eu/gateway", "eu/database"],
      "peer.ai": ["shared/peer_system", "external/partner", "external/observer"],
    },
    duplicateEdges: [],
    presentations: {},
  };
}

function element(context, localId, type, baseTypes, sourceIdentity, parent = undefined, options = {}) {
  const attributes = {
    name: [localId],
    ...(options.external === true ? { kind: ["external"] } : {}),
    ...(options.uses === undefined ? {} : { uses: options.uses }),
  };
  return {
    id: `${context}/${localId}`,
    context,
    localId,
    type,
    constructor: type[0].toLowerCase() + type.slice(1),
    sourceIdentity,
    ...(parent === undefined ? {} : { parent }),
    baseTypes,
    attributes,
    ...(options.deployed === true ? { deployed: true } : {}),
    ...(options.uses === undefined ? {} : { listAttributes: ["uses"], referenceAttributes: ["uses"] }),
  };
}

function nestingLevel(item) {
  if (item.parent === undefined) {
    return 1;
  }
  return item.parent.split("/").length + 1;
}

function edge(source, target, line, sourceIdentity, projected = false) {
  return {
    id: `edge-${line.toString(16).padStart(32, "0")}`,
    source,
    target,
    operator: "Wire",
    type: "Wire",
    sourceIdentity,
    declaration: { sourceName: sourceIdentity, line, column: 1 },
    attributes: {},
    ...(projected ? { projected: true } : {}),
  };
}
