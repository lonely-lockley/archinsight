import assert from "node:assert/strict";
import {
  buildLanguageSnapshotResultFromSources,
  CompletionEngine,
  coreLanguageSnapshot,
  createGeneratedInsightSyntaxProvider,
  linkProject,
} from "../build/runtime/index.js";

const completion = new CompletionEngine(createGeneratedInsightSyntaxProvider());
const catalogSnapshot = snapshot(`
define type EntryConfig of BoundaryElement
    constructor entryConfig

    required Text format

define type CatalogEntry of BoundaryElement
    constructor catalogEntry

    required Text name
    EntryConfig config

define type CatalogSection of BoundaryElement
    constructor catalogSection

    capability = "document-aggregate-member"

    List of CatalogEntry _

define type CatalogDocument of BoundaryElement
    capability = "document-aggregate-root"

    required Text name
    CatalogEntry featured
    List of CatalogSection _
`);
assertNoErrors(catalogSnapshot.diagnostics);

for (const fixture of [
  {
    id: "named",
    group: `catalogEntry highlighted
            name = Highlighted`,
    anonymous: false,
  },
  {
    id: "anonymous",
    group: `catalogEntry _
            name = Anonymous`,
    anonymous: true,
  },
  {
    id: "shortened",
    group: `name = Inferred`,
    anonymous: true,
  },
]) {
  const result = linkProject({
    snapshot: catalogSnapshot.snapshot,
    sources: [source(`${fixture.id}.ai`, `
environment ${fixture.id}
    name = ${fixture.id}

catalogSection release
    featured:
        ${fixture.group}
`)],
  });
  assertNoErrors(result.diagnostics);
  const root = result.elements.find((element) => element.id === `${fixture.id}/${fixture.id}`);
  const section = result.elements.find((element) => element.localId === "release");
  const entry = result.elements.find((element) => element.type === "CatalogEntry");
  assert.equal(root?.type, "CatalogDocument");
  assert.equal(section?.type, "CatalogSection");
  assert.equal(section?.parent, root?.id);
  assert.equal(entry?.parent, section?.id);
  assert.equal(entry?.anonymous === true, fixture.anonymous);
}

assertCompletionCandidates(`
environment catalog
    name = Catalog

catalogSection release
    featured:
        <caret>
`, ["name", "config"], ["featured", "format", "region"]);

assertCompletionCandidates(`
environment catalog
    name = Catalog

catalogSection release
    featured:
        catalogEntry highlighted
            <caret>
`, ["name", "config"], ["featured", "format", "region"]);

assertCompletionCandidates(`
environment catalog
    name = Catalog

catalogSection release
    featured:
        catalogEntry _
            config:
                <caret>
`, ["format"], ["config", "featured", "region"]);

const missingConstructor = snapshot(`
define abstract type MissingEntry of BoundaryElement

define type MissingSection of BoundaryElement
    constructor missingSection
    capability = "document-aggregate-member"
    List of MissingEntry _

define type MissingCatalog of BoundaryElement
    capability = "document-aggregate-root"
    MissingEntry missing
    List of MissingSection _
`);
assertNoErrors(missingConstructor.diagnostics);
const missingResult = linkProject({
  snapshot: missingConstructor.snapshot,
  sources: [source("missing.ai", `
environment missing

missingSection section
    missing:
        value = absent
`)],
});
assert.equal(missingResult.diagnostics.filter((item) => item.code === "CONSTRUCTOR_NOT_DECLARED").length, 1);

const ambiguousConstructor = snapshot(`
define abstract type EntryBase of BoundaryElement

define type EntryA of EntryBase
    constructor entryA

define type EntryB of EntryBase
    constructor entryB

define type AmbiguousSection of BoundaryElement
    constructor ambiguousSection
    capability = "document-aggregate-member"
    List of EntryBase _

define type AmbiguousCatalog of BoundaryElement
    capability = "document-aggregate-root"
    EntryBase choice
    List of AmbiguousSection _
`);
assertNoErrors(ambiguousConstructor.diagnostics);
const ambiguousConstructorResult = linkProject({
  snapshot: ambiguousConstructor.snapshot,
  sources: [source("ambiguous-constructor.ai", `
environment ambiguous

ambiguousSection section
    choice:
        value = ambiguous
`)],
});
assert.equal(ambiguousConstructorResult.diagnostics.filter((item) => item.code === "CONSTRUCTOR_AMBIGUOUS").length, 1);

const ambiguousSchema = snapshot(`
define type SharedEntry of BoundaryElement
    constructor sharedEntry

define type SharedSection of BoundaryElement
    constructor sharedSection
    capability = "document-aggregate-member"
    List of SharedEntry _

define type CatalogA of BoundaryElement
    capability = "document-aggregate-root"
    SharedEntry shared
    List of SharedSection _

define type CatalogB of BoundaryElement
    capability = "document-aggregate-root"
    SharedEntry shared
    List of SharedSection _
`);
assertNoErrors(ambiguousSchema.diagnostics);
const ambiguousSchemaResult = linkProject({
  snapshot: ambiguousSchema.snapshot,
  sources: [source("ambiguous-schema.ai", `
environment ambiguous

sharedSection section
    shared:
        sharedEntry item
`)],
});
const schemaDiagnostic = ambiguousSchemaResult.diagnostics.find((item) => item.code === "DOCUMENT_AGGREGATE_SCHEMA_AMBIGUOUS");
assert(schemaDiagnostic);
assert.match(schemaDiagnostic.message, /'CatalogA', 'CatalogB'/);

console.log("document aggregate contracts passed");

function assertCompletionCandidates(sourceWithCaret, required, forbidden) {
  const cursorOffset = sourceWithCaret.indexOf("<caret>");
  const sourceText = sourceWithCaret.replace("<caret>", "").trimStart();
  const result = completion.complete({
    sourceName: "completion.ai",
    source: sourceText,
    cursorOffset: cursorOffset - (sourceWithCaret.length - sourceWithCaret.trimStart().length),
    snapshot: catalogSnapshot.snapshot,
  });
  const labels = new Set(result.items.map((item) => item.label));
  for (const label of required) assert(labels.has(label), `Missing '${label}' from ${[...labels].join(", ")}`);
  for (const label of forbidden) assert(!labels.has(label), `Unexpected '${label}' in ${[...labels].join(", ")}`);
}

function snapshot(definitions) {
  return buildLanguageSnapshotResultFromSources([source("definitions.ai", definitions)], [coreLanguageSnapshot]);
}

function source(sourceName, sourceText) {
  return { sourceName, source: sourceText.trimStart() };
}

function assertNoErrors(diagnostics) {
  assert.deepEqual(diagnostics.filter((item) => item.level === undefined || item.level === "ERROR"), []);
}
