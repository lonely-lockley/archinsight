import assert from "node:assert/strict";
import {
  coreLanguageSnapshot,
  parseWithGeneratedInsightParser,
} from "../build/runtime/index.js";

const cases = [
  parsesEmptyDocument,
  parsesWhitespaceOnlyDocument,
  parsesArchitectureFile,
  parsesArchitectureWithComponentStyleNestedElements,
  parsesEmptyContextWithoutOptionalName,
  parsesContextWithMultipleSystems,
  parsesNestedElementsThroughAnonymousLists,
  parsesNamedPrefixOperatorInvocation,
  parsesNamedImportsWithOptionalAlias,
  parsesAnonymousImportOnOperatorInvocation,
  parsesArchitectureFileWithoutTrailingNewline,
  parsesAnonymousImportAtEofWithoutTrailingNewline,
  parsesAnnotationsAndInlineNotes,
  parsesEmptyAndTextAnnotationParameters,
  rejectsAnnotationOnAssignment,
  keepsInlineNotesSeparateFromFullLineComments,
  parsesInlineNoteAtEofWithoutTrailingNewline,
  parsesElementInlineNoteAtEofWithoutTrailingNewline,
  parsesFullLineCommentAtEofWithoutTrailingNewline,
  rejectsContextAfterDefinitions,
  rejectsArchitectureFileWithoutLeadingContext,
  rejectsDefinitionsInsideArchitectureFile,
  rejectsNestedContextDeclaration,
  rejectsNamedImportFromNonContextObject,
  parsesFrameworkAssignmentAtEofWithoutTrailingNewline,
  parsesPresentationDefinitions,
  parsesFinalAnonymousListAttribute,
  parsesProjectAfterFinalAnonymousListAttribute,
  rejectsAnonymousAttributeWithNonListType,
  rejectsNamedAttributeAfterAnonymousListAttribute,
  rejectsMultipleAnonymousListAttributes,
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
  console.log("syntax contract fixtures passed");
}

function parsesEmptyDocument() {
  assertParses("");
}

function parsesWhitespaceOnlyDocument() {
  assertParses(" \t\n\r\n");
}

function parsesArchitectureFile() {
  assertParses(`
context test
    name = Test

import github from context external_systems as g
import google from context external_systems

external system xxx
    name = External

system app
    name = App
    links:
        -> g
        -> google
`);
}

function parsesArchitectureWithComponentStyleNestedElements() {
  assertParses(`
context archinsight
    name = Archinsight

import google from context external_systems

system archinsight_editor
    name = Archinsight Editor
    links:
        -> google

    service backend
        name = Backend API
        components:
            component language_pipeline
                name = Language pipeline
                links:
                    -> project_linker

            component project_linker
                name = Project linker

    container repository_store
        name = Repository database
`);
}

function parsesEmptyContextWithoutOptionalName() {
  assertParses("context empty");
}

function parsesContextWithMultipleSystems() {
  assertParses(`
context fintech
    name = Fintech

system payments
    name = Payments

system accounting
    name = Accounting
`);
}

function parsesNestedElementsThroughAnonymousLists() {
  assertParses(`
context fintech
    name = Fintech

system payments
    name = Payments
    container api
        name = API
    container database
        name = Database
`);
}

function parsesNamedPrefixOperatorInvocation() {
  assertParses(`
context test

external system xxx
    name = ooo
`);
}

function parsesNamedImportsWithOptionalAlias() {
  assertParses(`
context archinsight

import google from context external_systems
import github from context external_systems as g
`);
}

function parsesAnonymousImportOnOperatorInvocation() {
  assertParses(`
context archinsight

system auth
    links:
        -> tt from external_systems
            technology = HTTP, REST
            description = Authenticate with Google
`);
}

function parsesArchitectureFileWithoutTrailingNewline() {
  assertParses(`
context test
    name = Very Important context

system test
    links:
        -> g`);
}

function parsesAnonymousImportAtEofWithoutTrailingNewline() {
  assertParses(`
context archinsight

system auth
    links:
        -> tt from external_systems`);
}

function parsesAnnotationsAndInlineNotes() {
  assertParses(`
# This model represents the real architecture.
context example

@planned
system source # element note
    name = Source system
    links:
        @attribute(style=dotted,arrowhead=diamond)
        -> target # synchronous call
            technology = HTTP, REST

system target
    name = Target system
    links:
        @deprecated(replace after migration)
        ~> source
`);
}

function parsesEmptyAndTextAnnotationParameters() {
  assertParses(`
context example

@planned()
@deprecated(replace after migration)
system source
    name = Source
`);
}

function rejectsAnnotationOnAssignment() {
  assertRejects(`
context example
    @planned
    name = Example
`);
}

function keepsInlineNotesSeparateFromFullLineComments() {
  const parsed = parse(`
# model note
context annotations

system source # element note
    links:
        -> target # edge note
`);

  assertNoSyntaxErrors(parsed);
  assert.equal(countRule(parsed.tree, parsed.ruleNames, "commentLine"), 1);
  assert.equal(countRule(parsed.tree, parsed.ruleNames, "note"), 2);
}

function parsesInlineNoteAtEofWithoutTrailingNewline() {
  assertParses(`
context annotations

system source
    links:
        -> target # synchronous call`);
}

function parsesElementInlineNoteAtEofWithoutTrailingNewline() {
  assertParses(`
context annotations

system source # source note`);
}

function parsesFullLineCommentAtEofWithoutTrailingNewline() {
  assertParses(`
context annotations

# trailing standalone comment`);
}

function rejectsContextAfterDefinitions() {
  assertRejects(`
define type Tier
    required Text name

context fintech
    name = Fintech
`);
}

function rejectsArchitectureFileWithoutLeadingContext() {
  assertRejects(`
system payments
    name = Payments
`);
}

function rejectsDefinitionsInsideArchitectureFile() {
  assertRejects(`
context fintech
    name = Fintech

define type Tier
    required Text name
`);
}

function rejectsNestedContextDeclaration() {
  assertRejects(`
context fintech

system payments
    context nested
`);
}

function rejectsNamedImportFromNonContextObject() {
  assertRejects(`
context fintech

import payments from system backend
`);
}

function parsesFrameworkAssignmentAtEofWithoutTrailingNewline() {
  assertParses(`
define operator Wire of Edge
    constructor -> System or Container
        on System or Container
        model = sync`);
}

function parsesPresentationDefinitions() {
  assertParses(`
define presentation Container
    header = name
    subtitle = technology
    body = description

    light
        fill = "#ffffff"
        stroke = "#333333"

    graphviz
        shape = box
        margin = "0.12,0.08"
`);
}

function parsesFinalAnonymousListAttribute() {
  assertParses(`
define type System of Element
    List of Container _
`);
}

function parsesProjectAfterFinalAnonymousListAttribute() {
  assertParses(`
define type InfrastructureComponent of Element
    constructor infrastructure

define type Compute of InfrastructureComponent
    constructor compute

    List of InfrastructureComponent _

    project:
        $from -> $this
`);
}

function rejectsAnonymousAttributeWithNonListType() {
  assertRejects(`
define type System of Element
    Text _
`);
}

function rejectsNamedAttributeAfterAnonymousListAttribute() {
  assertRejects(`
define type System of Element
    List of Container _
    Text description
`);
}

function rejectsMultipleAnonymousListAttributes() {
  assertRejects(`
define type System of Element
    List of Container _
    List of Service _
`);
}

function assertParses(source) {
  assertNoSyntaxErrors(parse(source));
}

function assertRejects(source) {
  assert(parse(source).syntaxErrors.length > 0);
}

function assertNoSyntaxErrors(parsed) {
  assert.equal(parsed.parseFailure, undefined, parsed.parseFailure?.message);
  assert.deepEqual(parsed.syntaxErrors, []);
}

function parse(source) {
  const trimmed = source.trimStart();
  return parseWithGeneratedInsightParser({
    sourceName: "syntax.ai",
    source: trimmed,
    cursorOffset: trimmed.length,
    snapshot: coreLanguageSnapshot,
  });
}

function countRule(tree, ruleNames, name) {
  if (tree === undefined) {
    return 0;
  }
  const index = typeof tree.getRuleIndex === "function" ? tree.getRuleIndex() : tree.ruleIndex;
  const current = ruleNames[index] === name ? 1 : 0;
  const children = tree.children !== undefined
    ? tree.children.filter((child) => child !== null)
    : typeof tree.getChildCount === "function"
      ? Array.from({ length: tree.getChildCount() }, (_, childIndex) => tree.getChild(childIndex))
      : [];
  return current + children.reduce((total, child) => total + countRule(child, ruleNames, name), 0);
}
