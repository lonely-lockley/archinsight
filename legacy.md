# Legacy lexer control-flow notes

This document records the non-obvious mechanics of the working legacy lexer.
It is intentionally about token-stream control flow, not about the language
syntax. Keep the old implementation available as a reference while building
the next grammar.

## Reference files

- `reference/legacy-v1/src/main/antlr/InsightLexer.g4`
- `reference/legacy-v1/src/main/antlr/InsightParser.g4`
- `reference/legacy-v1/src/main/java/com/github/lonelylockley/archinsight/lexer/IndentHelper.java`
- `reference/legacy-v1/src/main/java/com/github/lonelylockley/archinsight/lexer/LexerState.java`
- `reference/legacy-v1/src/main/antlr/typescript_substitutions.properties`

The generated lexer is not a plain ANTLR lexer. Its `nextToken()` method is
overridden in the legacy `InsightLexer.g4` and delegates to `IndentHelper`. The helper
calls `supplyToken()`, which delegates back to `super.nextToken()`. This avoids
recursion and places a FIFO queue between ANTLR and consumers of the lexer.

## Mental model

ANTLR still recognizes physical input. `IndentHelper` turns physical layout
into a richer logical token stream by inserting synthetic tokens:

- `EOL`
- `INDENT`
- `DEDENT`
- `WRAP`
- `UNWRAP`

`TEXT` is also declared explicitly because lexer rules in a dedicated mode
remap their result to this logical token type.

When an ANTLR action adds synthetic tokens while scanning a real token,
`IndentHelper.nextToken()` appends the real token behind them and emits the
queued tokens first. For example, scanning the first text fragment after `=`
produces:

```text
WRAP TEXT
```

The synthetic token queue is the central mechanism. Do not replace the helper
with parser rules alone unless the same token ordering is preserved.

## Structural newlines and indentation

In the default lexer mode, the physical newline rule is:

```antlr
EOL : Nl+ (Ws+)? { this.helper.checkIndentation(); } -> skip ;
```

The matched physical token is skipped. `checkIndentation()` reads the complete
matched text, emits one synthetic `EOL`, calculates indentation after the
newline run, then emits zero or more `INDENT` or `DEDENT` tokens.

The logical order is:

```text
tokens of previous line
EOL
INDENT or DEDENT tokens, if needed
tokens of next line
```

Indentation rules:

- One indentation level is four spaces.
- A tab counts as one complete level.
- Arbitrary jumps emit multiple `INDENT` or `DEDENT` tokens.
- A width that is not divisible by four reports a lexer syntax error.
- Error reporting does not immediately abort tokenization.

The physical `EOL` rule intentionally consumes adjacent newlines and the
indentation before the next content line. Truly empty consecutive lines can
therefore collapse into one logical `EOL`. A whitespace-only blank line is a
different edge case because spaces interrupt `Nl+`; preserve or test the
desired behavior explicitly in the new lexer.

## Unquoted text values

`=` switches the lexer into `VALUE_MODE`:

```antlr
EQ : '=' Ws* -> pushMode(VALUE_MODE) ;
```

This is what allows text values without quotes. In `VALUE_MODE`, punctuation,
keywords and spaces are text rather than ordinary language tokens:

```antlr
VALUE_TEXT : NonWs ~[\r\n]* { this.helper.wrapValue(); } -> type(TEXT) ;
VALUE_EOL  : Nl+ (Ws+)? { this.helper.unwrapValue(); } -> skip ;
```

Leading spaces immediately after `=` are consumed by `EQ`. The first actual
text character must be non-whitespace. The rest of the physical line, except
the newline, belongs to the same `TEXT` token.

The first `VALUE_TEXT` invokes `wrapValue()` and produces:

```text
WRAP TEXT("first line")
```

Later text lines do not emit another `WRAP`.

The parser can therefore use a stable boundary rule:

```antlr
parameterValue : WRAP TEXT+ UNWRAP ;
```

## Multiline text

`VALUE_EOL` decides whether the next physical line continues text or exits
text mode. It compares indentation after the newline with the current
structural indentation level.

If the new indentation is exactly one level deeper:

```text
newIndentation == indentation + 1
```

the value continues. The helper inserts a logical newline as a text fragment:

```text
TEXT("\n")
```

The next physical text line is then emitted as another `TEXT`.

Example:

```text
    name = First line
        Second line
    description = Next field
```

Relevant logical tokens:

```text
NAME EQ WRAP TEXT("First line") TEXT("\n") TEXT("Second line")
UNWRAP EOL DESCRIPTION EQ WRAP TEXT("Next field")
```

If indentation after `VALUE_EOL` is less than or equal to the current
structural indentation, the value ends. The helper:

1. emits `UNWRAP`;
2. emits `EOL`;
3. pops `VALUE_MODE`;
4. emits any required `DEDENT` tokens.

If indentation is deeper than exactly one continuation level, it reports an
indentation error. This fixed extra level is an important part of the current
unquoted multiline-text contract.

## EOF behavior

EOF handling is deliberately asymmetric.

When EOF arrives while text is wrapped, full-document mode inserts `UNWRAP`
before EOF so the parser can still match `WRAP TEXT+ UNWRAP`:

```text
NAME EQ WRAP TEXT("value") UNWRAP EOF
```

However, EOF does not synthesize a final structural `EOL`, and it does not
flush open `DEDENT` tokens. The parser compensates with:

```antlr
softEOL    : EOL | EOF ;
softDedent : DEDENT | EOF ;
```

This is intentional legacy behavior. A new grammar must either preserve it or
replace it consistently in both lexer and parser.

There is also a legacy state quirk: EOF-in-text queues `UNWRAP`, but does not
reset `wrapped`, `wasText`, indentation, or lexer mode. Token output is usable,
while `snapshotState()` still describes the pre-EOF continuation state. Do not
silently depend on post-EOF state normalization.

## Incremental single-line mode

The old frontend uses the same design for Monaco line-by-line highlighting.
The TypeScript port lives in the older frontend as `IndentHelper.ts`,
`LexerState.ts`, and `InsightHighlight.ts`.

For each editor line it:

1. creates a fresh lexer for `"\n" + line`;
2. enables single-line mode;
3. restores the previous `LexerState`;
4. tokenizes until EOF;
5. saves a cloned state for the next line.

The prepended newline is significant: it lets the lexer process indentation or
text continuation before scanning the current line.

`LexerState` intentionally contains only:

- current indentation level;
- whether an unquoted text value is open.

When `wasText` is restored, the helper marks text as wrapped and pushes
`VALUE_MODE` before scanning the next line.

Single-line mode changes two behaviors:

- default-mode dedents are suppressed in `checkIndentation()`;
- EOF does not inject `UNWRAP`.

This keeps an unfinished text value open across editor lines. Transitions out
of `VALUE_MODE` still emit `UNWRAP`, `EOL`, and required `DEDENT` tokens.

This mode assumes a fresh lexer instance for every line. `restoreState()` is
not designed as a complete reset for reusing an already-consumed helper: the
queue and EOF flag are not reset. It also cannot restore arbitrary lexer
modes, such as a multiline annotation-parameter mode.

## Synthetic token locations

`createToken()` anchors synthetic tokens around the lexer's current character
index. Calls pass line and offset corrections because ANTLR has already
consumed the physical newline or text fragment when the helper runs.

These positions matter for debugger views, editor integration and useful
errors. When changing token injection order, verify source ranges as well as
token types and text. The older Java tests primarily assert type and text, so
location regressions can otherwise go unnoticed.

## TypeScript generation bridge

The comments in the legacy `InsightLexer.g4` are marker blocks:

```text
/* <package> */ ... /* </package> */
/* <import> */ ... /* </import> */
/* <override> */ ... /* </override> */
```

`typescript_substitutions.properties` contains replacements for generating a
TypeScript lexer with equivalent helper integration. These markers are not
decorative if frontend generation is still required.

The TypeScript helper mirrors the Java helper closely. It additionally assigns
token indexes and has slightly different source-position handling for errors.

## Secondary lexer mode

Annotation arguments use another mode:

```antlr
LPAREN          : '(' -> pushMode(ANNOTATION_PARAMETERS) ;
PARAMETERS_TEXT : ~[()]+ -> type(ANNOTATION_VALUE);
RPAREN          : ')' -> popMode;
```

This isolates annotation payload from ordinary tokenization. It is separate
from the indentation/text machinery, but it demonstrates the same design
principle: switch lexer modes when a region has different lexical semantics.
Nested parentheses are not supported by this legacy mode.

## Regression checklist for the next lexer

Before replacing the old implementation, keep token-level tests for:

- structural newline followed by one or multiple `INDENT` tokens;
- dedent across one or multiple levels;
- truly empty lines between declarations;
- indentation widths not divisible by four;
- a single-line unquoted value;
- multiline text with `TEXT("\n")` between fragments;
- exit from multiline text to a sibling field;
- exit from multiline text while dedenting to an outer declaration;
- EOF directly after ordinary structural syntax;
- EOF directly after unquoted text;
- comments adjacent to structural newlines;
- annotation values, including an empty `()`;
- incremental tokenization with restored `LexerState`;
- synthetic token line, column, start and stop positions.

## Guidance for the new grammar

Treat the current lexer and helper as executable reference behavior. The new
syntax can evolve independently, but preserve these ideas unless there is an
explicit replacement:

- Newlines are meaningful logical tokens, not discarded whitespace.
- Indentation changes are translated into explicit tokens; EOF is handled
  separately by the parser contract.
- Unquoted text is lexed in a dedicated mode.
- Multiline text continuation is indentation-sensitive.
- Text boundaries are explicit synthetic tokens.
- EOF policy is coordinated with parser rules.
- Incremental editor tokenization needs a small clonable lexer state.

## New language model

The next version keeps the surface shape of existing Insight documents as much
as possible. Existing users should ideally not need to rewrite architecture
descriptions. The major change is semantic: domain element kinds are no longer
hard-coded lexer keywords. They are declared through a type system.

Insight describes distributed-system architecture using a deliberately focused
subset of ideas based on the C4 model:

- context;
- container;
- deployment.

Components are intentionally out of scope because they are usually easier to
inspect in source code.

After parsing and linking, the result should be a graph of objects and
relationships. C1, C2 and deployment/C4 views are projections derived from
that graph rather than separate source models.

### Naming convention

Language keywords and constructor names start with a lowercase letter.
Type names start with an uppercase letter.

Examples:

```text
extend
system
System
```

Capitalization is therefore semantically meaningful and should be reflected in
lexer tokens for keywords, constructors and type identifiers.

### Types and constructors

Element kinds such as `System`, `Service` and `Storage` are types rather than
reserved language keywords.

A type can declare a constructor. A constructor provides a lowercase
source-level spelling for instantiating that type while preserving the old
document shape.

Conceptually:

```text
System type -> system constructor -> system payments instance
```

Users should not be forced to write:

```text
System payments
```

when the framework declares `system` as the constructor for `System`.

The exact declaration syntax for types and constructors still needs to be
captured from the framework example.

### Operators and edges

An operator is an action applied to the current object in whose body it is
written. The right-hand side must identify another object.

Examples of intended surface syntax:

```text
-> target
~> target
```

Each operator creates an object of its declared operator type. The base type
after `of` determines what kind of object that is. For example,
`define operator External of System` declares an `External` type inheriting
from `System`.

The type union after an operator constructor spelling describes the allowed
right-hand operand types. It does not select the type of the created object.
The nested `on` clause describes the allowed left-hand operand types: the
current objects in whose bodies the operator may be used.

Operators based on `Edge` are the constructor form used for graph edges.

`Edge` instances are always anonymous: an operator does not declare a separate
edge identifier. `Element` instances follow the opposite rule and require an
entity identifier.

### Extending types

The `extend` keyword adds attributes to an existing type.

The linker must enforce a project-wide invariant:

```text
at most one extend declaration per target type
```

This prevents additions to one type from being scattered across many files.
The parser can accept `extend` declarations independently; uniqueness is a
linking concern because it spans the project.

### Built-in classes

The language has these built-in classes:

- `Enum`
- `List`
- `Edge`
- `Element`
- `Context`
- `Nothing`

`Element` and `Edge` are base classes. They let parsing and linking distinguish
graph nodes from graph relationships.

`Context` represents a bounded context. For example, a company's fintech
cluster can be a context containing all systems related to fintech.

`Nothing` is a built-in marker type for the absence of a parent object. It is
known to the linker without a framework declaration and cannot be
instantiated.

The framework describes its constructor explicitly:

```text
define type Context
    constructor context
        on Nothing

    Text name
    List of System _
```

`Nothing` marks that a context is a root object rather than a child of another
architecture object. The framework-level `Context` declaration makes the root
semantics explicit. The source spelling `context` is also a reserved structural
keyword: every architecture file must begin with `context <id>`. Keeping the
framework constructor declaration still matters because it describes the
`Context` type and its allowed attributes.

`Enum` describes an enumeration suitable for entity attributes.

`List` describes repeated values or child declarations.

### Lists

A named attribute of type `List` uses a colon, followed by a newline and a
block indented by one additional level.

The legacy `links` shape is the reference example:

```text
links:
    -> billing
    ~> notifications
```

A type can also end with an anonymous attribute whose special identifier is
`_`.

The anonymous attribute contract is:

- it must be the final attribute of the type;
- it must have type `List`;
- nested values are written without the `_` identifier;
- nested values do not require a colon introducing the anonymous list.

This preserves the old implicit nesting style where containers can be written
inside systems without an explicit list attribute:

```text
system payments
    service api
    storage database
```

The parser rejects an anonymous `_` attribute unless it has the form
`List of <Type> _` and is the final significant attribute of its declaration.
It also rejects multiple anonymous attributes in one declaration. If `_` is
introduced by `extend`, the linker must still validate its compatibility with
the merged base type across files.

### Parsing and linking boundary

The parser should recognize declarations and preserve enough information for
linking. Cross-file and graph-wide rules belong to the linker.

Known linker responsibilities:

- resolve constructors to declared types;
- resolve operators to edge types;
- resolve right-hand operator operands to graph objects;
- distinguish `Element` nodes and `Edge` relationships through their base
  classes;
- enforce one `extend` declaration per target type across the project;
- validate cross-file compatibility when an anonymous `_` list attribute is
  introduced by `extend`;
- construct the linked object graph;
- derive C1, C2 and deployment/C4 projections from the graph.

### Open syntax details

The built-in framework is stored as `.ai` runtime resources under
`src/main/resources/com/github/lonelylockley/insight/`. These files establish
the first concrete syntax slice and are part of the language implementation,
not example schemas.

Observed language keywords and punctuation:

```text
define extend type operator text enum of _ or on = constructor required
import from as context List : @planned @deprecated @attribute ( )
```

`required` appears in the framework example and is part of the initial grammar
even though it was not present in the first keyword list. `:` is reserved for
named list values in architecture documents.

Type declarations:

```text
define type Container of Element
    constructor container
        on System

    required Text name
    List of Wire links
```

The base type after `of` is optional:

```text
define type Tier
    required Text name
```

Operator declarations:

```text
define operator Wire of Edge
    constructor -> System or Container
        on System or Container
        model = sync

    Text description
```

The declared operator type can have multiple constructors. A constructor can
be symbolic, such as `->`, or named, such as `external`. Its following type
union describes valid right-hand operand types. Its nested `on` clause
describes valid left-hand current-object types. A constructor can also assign
default attribute values.

Named constructor example:

```text
define operator External of System
    constructor external System
        on Context
        kind = external
```

This declares an `External` subtype of `System`. In `external system payments`,
the operator is applied to the current `Context`, while the object on its right
must resolve to `System`.

Enum declarations:

```text
define enum of Tier
    t1
        name = Tier 1
        sla = 99.95%
```

Extension declarations:

```text
extend type Container
    Tier tier
```

Attribute declarations:

```text
Text technology
required Text model
List of Wire links
List of Container _
```

Assignment values remain unquoted text:

```text
kind = internal
name = Tier 1
sla = 99.95%
```

The framework example currently contains both uppercase `Text` and lowercase
`text`:

```text
required Text name
required text kind
```

The initial lexer accepts both forms. Uppercase `Text` is parsed as an ordinary
type identifier; lowercase `text` is parsed as the scalar keyword. Their final
semantic relationship still needs to be decided explicitly.

Still open:

- deployment-specific framework types;
- semantic rules for constructor defaults;
- whether uppercase `Text` remains a framework-defined alias or all framework
  declarations should use lowercase `text`.

## Historical Java implementation status

Archinsight source files use the `.ai` extension.

The former Java grammar in `src/main/antlr` parsed the framework metamodel slice. That Java implementation has been removed; the active grammar now lives in `packages/insight-language/grammar`.

- `define type`;
- `define operator`;
- `define enum`;
- `extend type`;
- constructors and `on` clauses;
- required and optional attributes;
- nested generic type references such as `List of Wire`;
- anonymous `_` attributes;
- unquoted assignment values.

The new active `LayoutLexerHelper` is adapted from the legacy queue-based
design. It retains:

- synthetic `EOL`, `INDENT`, `DEDENT`, `WRAP`, `UNWRAP` tokens;
- `VALUE_MODE` for unquoted text;
- incremental single-line state restoration for highlighting;
- full-document parsing.

One EOF behavior intentionally differs from legacy code. In full-document
mode, the new helper closes an open text value, emits a logical `EOL` when the
last physical line has no trailing newline, and then emits all outstanding
`DEDENT` tokens before EOF. The order is:

```text
UNWRAP? EOL? DEDENT* EOF
```

This matters while a user is typing: a document ending immediately after
`model = sync` must remain parseable before Enter is pressed. The new parser
can require balanced layout tokens instead of using
`softDedent : DEDENT | EOF`.

## Architecture documents

The active grammar now has two mutually exclusive top-level file modes:

1. A definition file contains `define` and `extend` declarations.
2. An architecture file starts with `context <id>` and contains instantiated
   architecture objects.

The two modes cannot be mixed in one file. A definition followed by `context`
is invalid, and a `define` or `extend` declaration inside an architecture file
is invalid.

Lowercase element and operator constructor spellings remain dynamic
identifiers. `context` is the deliberate exception: it is a structural keyword
because it selects the architecture-file mode and establishes the namespace
fragment before linking. Framework declarations still describe the `Context`
type itself. Other constructor names remain driven by linked declarations and
future autocomplete.

Current architecture example:

```text
context test
    name = Very Important context

system test
    name = jjj
    technology = kkk
    links:
        -> g
```

This is stored in `examples/architecture.ai`.

The repository also keeps `examples/archinsight.ai` as a compatibility
regression fixture copied from the current Archinsight project syntax. It
covers:

- a long leading license comment block;
- named imports;
- nested `system`, `service` and `storage` declarations;
- edge operator blocks;
- multiline unquoted descriptions, including URLs and list-like text lines;
- element and edge annotations.

Both the ANTLR syntax layer and `ModelParser` must parse this fixture without
errors.

The context `name` attribute is optional. A context can contain zero or more
top-level declarations through its anonymous `List of System _` attribute:

```text
context empty
```

```text
context fintech
    name = Fintech

system payments
    name = Payments

system accounting
    name = Accounting
```

Supported architecture shapes:

- leading bounded-context declaration:

  ```text
  context fintech
      name = Fintech
  ```

- element constructor invocation with an identifier:

  ```text
  system payments
      name = Payments
  ```

- named prefix-operator invocation:

  ```text
  external system payments
      name = External payments
  ```

- nested elements for anonymous `_` lists:

  ```text
  system payments
      container api
          name = API
  ```

- named list blocks:

  ```text
  links:
      -> billing
  ```

- symbolic operator invocation with a right-hand object identifier:

  ```text
  -> billing
  ~> notifications
  ```

- named imports at architecture-file top level:

  ```text
  import google from context external_systems
  import github from context external_systems as g
  ```

- anonymous imports attached to operator invocations:

  ```text
  -> identity_store
  -> tt from external_systems
      technology = HTTP, REST
      description = Authenticate with Google
  ```

- unquoted text assignments:

  ```text
  name = Very Important context
  ```

Architecture files are also valid without a trailing physical newline. The
full-document EOF contract supplies the final logical `EOL` and closing
`DEDENT` tokens required by the parser.

The parser already verifies that an architecture file starts with
`context <id>`, that nested `context` declarations are rejected, and that
named imports use `from context <id>`.

The parser intentionally does not yet verify:

- whether `system`, `container` or another lowercase constructor is declared;
- whether `external` or another named prefix operator is declared;
- whether a constructor is legal in its current parent object;
- whether `links` is declared as a named `List`;
- whether `->` or `~>` is a declared operator;
- whether an operator is valid for the current source and target types;
- whether a nested element is accepted by an anonymous `_` list.

Import syntax is structurally parsed but still needs linker semantics:

- A named import has the shape
  `import <name> from context <context-id> [as <alias>]`.
- An anonymous import is available on an operator invocation as
  `<operator> <target> from <context-id>`.
- The linker must resolve named imports, aliases and anonymous external target
  lookups against linked contexts.

These checks need the linked framework model and belong to semantic validation
or linking rather than syntax parsing.

## Historical parser data model

The removed Java ANTLR tree-to-model parser lived in
`com.github.lonelylockley.insight.parser`. It is separate from the generated
ANTLR classes in `com.github.lonelylockley.insight.lang`.

The removed Java model lived in `com.github.lonelylockley.insight.parser.model`. Built-in
language concepts have direct Java implementations:

- `Context`;
- `Element`;
- `Edge`;
- `List`;
- `Enum`;
- `Nothing`.

User-defined architecture elements are represented by `GenericElement`.
User-defined framework declarations remain generic descriptors such as
`TypeDefinition`, `OperatorDefinition`, `Constructor`, `Attribute` and
`TypeReference`. Adding a DSL type must not require adding a Java class.

Every parsed model entity carries a `Symbol` containing its declaration file
and source span. `Entity.declarationFile()` exposes the file directly. This
includes elements, edges, imports, lists, assignments, annotations, type
descriptors and unresolved edge target references. The future linker must
preserve and use these symbols for diagnostics and editor highlighting.

`Context` is the only namespace boundary. Textual nesting does not introduce a
parent-level scope. The namespace indexes all elements inside the context,
including textually nested elements and imports, as one flat collection. Two
different contexts may contain elements with the same identifier.

One logical context may be spread across multiple `.ai` files. Each file starts
with the same context declaration and contributes a context fragment, for
example:

```text
# payments.ai
context fintech

system payments
```

```text
# accounting.ai
context fintech

system accounting
```

`ModelParser` preserves each fragment and the declaration file of every
entity. The future linker must combine fragments with the same context id into
one flat context namespace.

A named import is represented as a dedicated `Import` subtype of `Element`.
Its local identifier is the `as` alias when one exists and the imported
identifier otherwise. This lets later linking use imports while resolving
local edge targets. A named import reserves that identifier in the merged
context namespace. The optional `as` alias exists specifically to avoid a
collision with another context name. The import remains visible for implicit
reference resolution only in its declaration file.

An anonymous import attached directly to an edge, such as
`-> target from fintech`, does not create an `Import` element and does not
reserve a namespace identifier.

Name uniqueness and reference resolution deliberately use different
boundaries:

- real element identifiers and named import identifiers must be unique across
  the entire merged context;
- an unqualified edge target resolves only against real elements and named
  imports declared in the same file as the edge;
- `from <context-id>` is an explicit context lookup, even when the context id
  is the current context;
- a named import reserves its name globally but is visible only in the file
  that declares it;
- an anonymous edge import does not reserve a name.

For example, if one file declares `system source` and another file in the same
context declares `system target`, this is intentionally invalid:

```text
-> target
```

The source file must state the dependency explicitly:

```text
-> target from fintech
```

or declare a file-local named import:

```text
import target from context fintech
```

This catches copied or detached files reliably. When an unqualified reference
is absent from the file-local scope but exists in the merged context, the
future linker should report a specific missing-import diagnostic rather than
a generic undeclared-identifier error.

`ContextNamespace` models this split explicitly. Its global index supports
cross-fragment uniqueness checks. Its file-local index supports implicit
reference resolution. Its explicit lookup supports `from <context-id>`.
`classifyImplicitReference` preserves the diagnostic distinction explicitly:

- `RESOLVED`;
- `MISSING_IMPORT`;
- `UNDECLARED`;
- `AMBIGUOUS`.

Each parsed `Edge` receives a runtime UUID. The UUID identifies that exact edge
object even when equivalent declarations exist. Duplicate detection uses a
separate stable `EdgeDuplicateKey` made from:

- flat source element address inside its context;
- operator spelling;
- optional imported target context identifier;
- target element identifier.

As a result, duplicate edges remain independently addressable while the
linker can still report or merge duplicates intentionally.

Annotations are stored as immutable lists on `Element` and `Edge`, so every
object supports zero or more annotations. The ANTLR grammar already wraps
annotated declarations with `annotation*`. `ModelParser` reads that wrapper
before constructing the model object, which provides the required buffering
without a global mutable annotation queue.

## Historical indexed linker graph

The removed Java in-process linker graph lived in `com.github.lonelylockley.insight.graph`.
It uses Guava `MutableNetwork<GraphNodeId, RelationId>` with directed edges,
parallel edges and self-loops enabled. It is intentionally separate from the
parser model: parsing preserves source structure, while the linked graph
supports incremental rebuilds and projections.

Graph nodes have stable typed ids:

- `SourceNodeId`;
- `ContextNodeId`;
- `ElementNodeId`;
- `TypeNodeId`.

Each `ElementNode` stores its `nestingLevel`. A logical `ContextNode` has
level `0`, its direct elements have level `1`, their nested elements have
level `2`, and so on. Lists and attributes do not increase the level. The
counter is independent from name lookup: a context namespace remains flat.

Graph relations have UUID ids. System relation kinds are:

- `DECLARES`;
- `CONTRIBUTES`;
- `CONTAINS`;
- `REFERENCES`;
- `IMPORTS`;
- `INHERITS`.

`GraphRelation.type` optionally stores a dynamic DSL relation type, for example
`Wire.sync`. `RelationKind` describes the infrastructure layer; the dynamic
type preserves user-defined language semantics without adding a Java enum
constant for every DSL extension.

`IndexedGraph` maintains direct indexes alongside Guava adjacency indexes:

- `contributionsBySource`;
- `dependentSourcesByNode`;
- `nodesByContext`;
- `nodesByBaseType`;
- `relationsByKind`;
- `relationsByType`.

`SourceContribution` directly contains the nodes and relations owned by one
source identity, plus nodes referenced by that source. Referenced nodes use
internal reference counts, so removing one of several relations does not
accidentally remove the source dependency.

Most declared nodes and every relation have an owner source identity. A source
identity can be a project file path or a virtual editor tab that does not exist
on disk yet. A logical `ContextNode` is the deliberate exception: it is
synthetic and shared by all sources contributing fragments of the same bounded
context. Each source owns a `CONTRIBUTES` relation from its `SourceNode` to
that shared `ContextNode`.

Incremental rebuild starts with `IndexedGraph.removeSourceContribution(source)`:

1. Load the source contribution directly without scanning the graph.
2. Collect sources that depend on nodes owned by the changed source.
3. Remove relations owned by the changed source.
4. Remove nodes owned by the changed source.
5. Remove incident foreign relations and add their owners to the rebuild set.
6. Reparse the changed source and relink the affected sources.

The graph is intentionally not thread-safe. One project-linker worker mutates
it and publishes immutable projections for readers.

## Historical project linking

The removed Java `com.github.lonelylockley.insight.linker.ProjectLinker` performed the first
architecture-linking pass across a collection of parsed `.ai` files.

The pass:

1. Merges all fragments with the same context id into one flat
   `ContextNamespace`.
2. Reports duplicate real element ids and colliding named import aliases
   across the entire context.
3. Materializes source identity, context and element nodes plus `CONTRIBUTES`,
   `DECLARES` and `CONTAINS` relations.
4. Resolves named imports to real `ElementNodeId` values and adds `IMPORTS`
   relations from the importing source identity.
5. Resolves edges to real graph targets and adds `REFERENCES` relations.

Named import aliases are file-local references but still occupy names in the
context namespace. Anonymous edge imports (`-> target from other_context`)
resolve directly and create no named alias.

Implicit edge resolution is intentionally file-local. If `target` is declared
in another file of the same logical context, `-> target` fails with
`MISSING_IMPORT`. The user must add an explicit named import. If no declaration
exists anywhere in the context, the diagnostic is `UNDECLARED_IDENTIFIER`.
This distinction makes copied or detached source files fail with an actionable
import error.

Every link diagnostic keeps the parser `Symbol` responsible for the problem.
Every resolved edge keeps its runtime UUID, so equivalent linked edges remain
independently addressable. `LinkResult.duplicateEdges()` groups such edges
without deleting them.

Resolved edges obey a generic nesting rule. An element may reference an
element at the same level or any higher level. It may not reference a more
deeply nested element. For example, a container may reference a sibling
container or its enclosing system, but a system may not reference one of its
containers. The linker compares graph `nestingLevel` values and reports
`EDGE_TARGET_IS_DEEPER_THAN_SOURCE` before adding an invalid `REFERENCES`
relation. The rule does not depend on constructor or user-defined type names.

Constructor-to-type and operator-to-edge-type resolution still belongs to the
framework-linking pass. Until that pass exists, element graph types use their
constructor spelling and `REFERENCES` relation types use their operator
spelling.

## Annotations

Architecture documents support exactly three annotations:

```text
@planned
@deprecated
@attribute
```

Each annotation optionally accepts text in parentheses:

```text
@planned
@deprecated(replace after migration)
@attribute(style=dotted,arrowhead=diamond)
```

Annotation parameter text is lexed in a dedicated
`ANNOTATION_PARAMETERS` mode. Everything up to the closing `)` is emitted as
one optional `ANNOTATION_VALUE` token. This preserves punctuation such as `=`
and `,` without involving ordinary assignment tokenization.

Annotations are valid as prefixes for architecture objects and edge operator
invocations:

```text
@planned
system source

links:
    @attribute(style=dotted,arrowhead=diamond)
    -> target
```

The parser rejects annotations attached to assignments and named list
attributes. The linker must additionally verify that the resolved annotated
type inherits from `Element` or `Edge`. That inheritance check cannot be done
by syntax parsing alone.

## Comments and notes

Architecture documents support two comment forms built from the same lexer
token:

1. A full-line comment starts with `#` and is parsed as standalone trivia.
2. An inline comment follows an element or edge declaration on the same
   physical line and is parsed as a `note`.

Full-line example:

```text
# This model represents the real architecture of the project.
# For detailed documentation, visit:
# https://archinsight.org/documentation/
context annotations
```

Inline notes:

```text
system source # Source-side HTTP calls
    links:
        -> target # Synchronous request
```

The parser keeps the two forms separate:

```antlr
commentLine : COMMENT EOL ;
note        : COMMENT ;
```

`note?` is part of `objectDeclaration` and `operatorInvocation` immediately
before their `EOL`. This attaches note text to the element or edge parse
subtree, allowing the future linker to preserve it as graph metadata.

The project linker preserves that metadata in place:

- element declaration notes become `ElementNode.note`;
- edge invocation notes become `GraphRelation.note` on the corresponding
  `REFERENCES` relation;
- infrastructure relations such as `CONTAINS` and `DECLARES` have no note.

Full-line comments remain independent `commentLine` trivia nodes. They are not
implicitly attached to the following declaration.

Inline notes are valid even when they end the file without a trailing physical
newline. The full-document EOF contract supplies the logical `EOL`.

The same guarantee applies to a standalone full-line comment at EOF. Both of
these partial editing states remain parseable before Enter is pressed:

```text
system source # source note
```

```text
# trailing standalone comment
```
