# C4: Code

A C4 diagram opens one or more components and shows the code structures that implement them. Depending on the project, those structures may be modules, packages, namespaces, classes, functions, database schemas, or another vocabulary that makes the implementation understandable.

Archinsight does not prescribe one universal code model. A service organized around modules needs a different vocabulary from a library organized around packages and public interfaces. The core library therefore provides the common `CodeElement` base type, while project definitions decide which code concepts exist and how they are nested.

## The `CodeElement` base type

`CodeElement` is an abstract subtype of `Element`. It has no constructor and introduces no required attributes. Deriving a project type from it gives instances normal graph-element behavior and makes them visible to the built-in C4 query:

```insight
define type Module of CodeElement
    constructor module

    required Text name
    Text responsibility
    List of Wire links
    List of CodeElement children
```

Definitions can introduce several code-element types, give each one a distinct presentation, and constrain their attributes to express the structure used by the project. Keeping these declarations in a definitions file preserves the separation between framework vocabulary and concrete architecture sources.

`CodeElement` is a separate branch below `Element`. It does not derive from `ComponentElement`, so project-defined code objects do not appear in the C3 view simply because they are code elements.

## Attaching code to components

The project decides how components contain code. A framework can add a named slot to the built-in `Component` type:

```insight
extend type Component
    List of CodeElement code
```

The model can then fill that slot with any compatible project-defined types:

```insight
context commerce

system storefront
    name = Storefront

    service checkout
        name = Checkout

        component order_processing
            name = Order processing
            code:
                module controller
                    name = Checkout controller
                    responsibility = Accepts checkout commands
                    links:
                        -> domain

                module domain
                    name = Checkout domain
                    responsibility = Applies checkout rules
                    children:
                        module validation
                            name = Order validation
```

The slot name and nesting rules are part of the project framework. Another project can use `packages`, `classes`, or several typed attributes instead of `code` and `children`. Type extensions should remain centralized in the project's definitions so the ownership model does not become scattered across source files.

## The built-in C4 view

The built-in C4 query selects every `CodeElement` associated with the current semantic tab. The scope includes objects contributed to roots from that tab through `extend`, even when the contributing declaration is stored in another file.

Relationships whose source and target are both `CodeElement` values are included. As elsewhere in Insight, the object that owns a wire is its source and the referenced object is its target. In the example above, `controller` owns the wire, so the diagram draws `controller → domain`.

Code elements are grouped by their immediate parent. This keeps modules under their component and nested code elements under the project-defined owner that contains them. A relationship can bring a target code element from outside the selected tab into the view when the source code element depends on it.

The default query deliberately relies only on the `CodeElement` marker, source scope, relationships, and ownership. It does not assume that a module contains classes, that classes contain methods, or that any particular code type is more important than another. A project can copy the built-in query and specialize it when its code vocabulary requires additional filtering or grouping.

## Choosing the useful depth

A C4 model should explain implementation structure rather than reproduce every declaration from the source tree. Add code elements when they reveal responsibilities, stable interfaces, important dependencies, or boundaries that are difficult to see at C3. Generated inventories of every class and function usually obscure those relationships and become expensive to maintain.

Code modeling is optional. A project can stop at C3 and still use Deployment diagrams independently. Deployment remains a physical projection of the logical model and is not the fourth C4 level.

## Validation

Definitions, containment slots, constructors, and references are validated by the linker. Query JSON then shows the exact code graph selected for the diagram:

```shell
archinsight link . --format text
archinsight query . -c <context> -s <code-source.ai> -v c4 --format json
archinsight render . -c <context> -s <code-source.ai> -v c4 -f svg -o code.svg
```

Inspect the JSON before relying on the rendered image. It makes the selected code identities, parent groups, and relationship direction explicit.
