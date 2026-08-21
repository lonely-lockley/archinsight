# Structuring an Insight Project

An Insight project is assembled from many source files into one typed architecture model. Context and environment identifiers define model namespaces, while files define explicit units of authorship and dependency. Directory names help people navigate the repository but do not change the meaning of declarations.

This separation allows a large architecture to remain readable without making file boundaries invisible. A reader can see when one source depends on a declaration owned by another source, and the linker can report which files are affected when that declaration changes or disappears.

## Source file roles

Each `.ai` file has one role: it defines language vocabulary, contributes to a logical context, or describes an infrastructure environment.

A definition file contains schema declarations:

```insight
define type PublicApi of Service
    constructor publicApi

    required Text owner

extend type Environment
    Compute compute

define presentation PublicApi
    header = name
    subtitle = owner
```

A context file begins with a logical context:

```insight
context commerce

system storefront
    name = Storefront
```

An environment file begins with an infrastructure environment:

```insight
environment eu
    name = Europe

deployment production
    name = Production
```

An environment file contains exactly one `environment <id>` header. The top-level `deployment` declarations that follow are owned by that environment, and one environment file may contain several deployments. Put another environment in another source file.

These forms cannot be mixed in one file. A definition file cannot also declare a `context` or `environment`, and a model file cannot introduce `define` or `extend type` declarations. A context and an environment are also distinct root forms, so one architecture file cannot contain both roots.

Keeping the roles separate makes schema changes easy to review and lets model files read as descriptions of concrete architecture. A project that needs custom vocabulary defines it in a framework file and uses its constructors from context and environment sources.

## Contexts across files

Several files can begin with the same context identifier. The linker treats them as contributions to one logical context and places their declarations in the same context namespace:

```text
commerce/
    storefront.ai
    catalog.ai
    checkout.ai
```

`storefront.ai`:

```insight
context commerce

system storefront
    name = Storefront
```

`catalog.ai`:

```insight
context commerce

system catalog
    name = Product catalog
```

Both systems have context-qualified identities: `commerce/storefront` and `commerce/catalog`. Repeating `context commerce` extends the set of declarations inside the context boundary; it does not create another context with the same name.

This pattern lets each file focus on one owned system while the project retains a coherent context-level model. Element identifiers must remain unique across every file contributing to the context. Declaring `system catalog` twice is a duplicate even when the declarations are in different directories.

It is useful to choose one file as the readable entry point for context-level metadata and broad relationships. Other files can repeat the context identifier without repeating `name` or other context attributes. This convention gives readers a predictable place to start while preserving the ability to split the context by system or responsibility.

## Source-local visibility

An identifier declared in the current source is visible throughout that source regardless of declaration order. An identifier declared in another source is outside the local scope until the current file imports it or qualifies the individual reference with `from`.

This rule also applies when both files contribute to the same context. In the previous example, `checkout.ai` cannot refer to `catalog` merely because both objects belong to `commerce`:

```insight
context commerce

import catalog from context commerce

system checkout
    name = Checkout
    links:
        -> catalog
```

The explicit same-context import is intentional. It records a dependency on another source boundary. If `catalog.ai` is removed from the project, the import becomes invalid and the linker reports the missing declaration at the dependency site. Automatic context-wide visibility would silently couple every file to all other files sharing the context and make repository refactoring harder to reason about.

Imports are local to the file that declares them. Importing `catalog` in `checkout.ai` does not make it visible in `storefront.ai`; that source declares its own dependencies.

## Named imports

A named import makes one declaration available to the rest of the current source:

```insight
import payment_provider from context external_platforms
```

The declaration can then be used by relationships and typed reference attributes:

```insight
system checkout
    links:
        -> payment_provider
```

The first identifier is the element being imported. `context external_platforms` identifies its owning namespace. The import preserves that ownership: it creates a local binding to `external_platforms/payment_provider` and does not copy or move the element into the current context.

Environment scopes use the corresponding form:

```insight
import eu from environment eu
```

This makes the environment declaration available to the source while retaining its environment namespace.

## Import aliases

`as` gives a named import a different local identifier:

```insight
import payment_provider from context external_platforms as payments

system checkout
    links:
        -> payments
```

The linked target remains `external_platforms/payment_provider`; only its source-local name changes. Aliases are useful when two contexts expose the same identifier, when a remote identifier would collide with a local declaration, or when the consuming model benefits from a name that expresses the dependency's role.

An alias belongs to the importing source. Other files may choose their own aliases for the same target without changing the target's project identity.

## Anonymous imports

An anonymous import qualifies a single reference instead of creating a reusable local binding. It is written directly after the referenced identifier:

```insight
context commerce

system checkout
    links:
        -> payment_provider from external_platforms
```

The linker resolves this occurrence as `external_platforms/payment_provider`. No named import or alias is added to the source, so another reference to the same element must repeat the qualifier or use a named import.

Anonymous imports are also used for values from environment scopes:

```insight
deploymentProfile production_service
    appliesTo:
        production from eu
```

Here `production` is resolved in the `eu` environment namespace for this list entry. The compact form keeps a one-off cross-scope reference next to its use and avoids introducing a file-wide name.

Named and anonymous imports provide two levels of dependency visibility. A named import belongs near the top of a source and suits a target used several times. An anonymous import suits a single relationship or list value whose owning scope is useful to see at the call site.

## Splitting objects with `extend`

A large object can be declared in one source and continued in other files of the same context. Object extension uses the constructor spelling and the existing identifier:

`checkout.ai`:

```insight
context commerce

system checkout
    name = Checkout

    service checkout_api
        name = Checkout API
```

`checkout-components/payment.ai`:

```insight
context commerce

extend service checkout_api
    component payment_adapter
        name = Payment adapter
        responsibility = Integrates with payment providers
```

The extension contributes attributes, children, and relationships to the existing `commerce/checkout_api` instance. It does not create another service. The constructor in the `extend` line must be compatible with the target's resolved type, and everything added by the body is validated against that type's schema.

The extension target is resolved within the shared context namespace, so `extend service checkout_api` can locate an object declared in another source of `commerce` without a named import. Ordinary references inside the extension body follow the regular visibility rule and require imports when their targets live in other files.

Object extension is well suited to extracting coherent detail from a large model: component groups, integrations, deployment information, or a set of relationships owned by one service. The main declaration remains the entry point and establishes the object's identity; extension files add focused slices without duplicating it.

`extend <constructor> <id>` extends one model object. `extend type <Type>` changes the schema of every instance of a type, and `extend presentation <Type>` changes its visual defaults. Keeping these forms in their appropriate file roles prevents a structural refactor from becoming an accidental language change.

## Choosing file boundaries

A practical default is one primary owned system per context file. Its containers, services, and the relationships needed to understand that system remain close to their owner. When one of those objects grows substantially, focused extension files can carry its deeper details.

Shared external actors and systems work best in one external context or a small number of contexts grouped by meaning:

```text
external/
    platforms.ai
    partners.ai
    regulators.ai
```

This gives every consuming system one canonical declaration to import. A separate file for every small vendor usually adds navigation cost without creating a useful architectural boundary.

Deployment definitions follow a similar separation:

- Framework files define environment types, infrastructure types, operators, type extensions, and presentations.
- Environment files contain concrete deployments and environment-local infrastructure inventory.
- Logical context files own deployment profiles that map their systems, containers, and services to that inventory.

File and directory paths remain organizational choices. Context IDs, environment IDs, and object IDs establish semantic identity, so renaming or moving a file does not rename the architecture it contains. File boundaries still define imports and the scope selected by `$tab` in diagram queries.

Relationships deserve particular care when files are split. A relationship belongs to the source containing its declaration and to the element under which it appears. Moving it can change the result of a view scoped to a selected source even when the complete project graph remains equivalent. After reorganizing files, validate both the linked model and the important source-scoped diagrams.
