# Comments and Notes

Insight uses `#` for text addressed to people reading the source. It can introduce a standalone comment or attach a short note to a declaration. Both forms make a model easier to maintain, but they serve different purposes in the linked project.

## Comments

A comment occupies the rest of its line:

```insight
# Public systems used by customers and partners
system storefront
    name = Storefront
```

Comments may appear between declarations and inside indented bodies. The parser recognizes them as source trivia, so they do not create attributes, elements, or relationships in the project graph. They are useful for explaining how a file is organized, recording guidance for its editors, and separating related areas of a larger declaration.

```insight
system commerce
    name = Commerce Platform

    # Customer-facing runtime units
    service storefront
        name = Storefront service

    # Background processing
    service order_worker
        name = Order worker
```

An entire line after `#` belongs to the comment. Insight has no block-comment syntax; several consecutive comment lines form a longer comment:

```insight
# The provider is shared by all public applications.
# Changes to this relationship require a platform review.
```

## Inline notes

A note follows an object or relationship declaration on the same line:

```insight
system billing # Owned by the finance platform team
    name = Billing
    links:
        -> ledger # Required to complete financial posting
```

The note is attached to the declared element or edge and retained in the linked model together with its source location. Tools can expose it during inspection or navigation while the architecture attributes remain governed by the element's type.

Notes work best for short source-level context that belongs to one declaration. Architectural information used in diagrams, queries, or validation belongs in a typed attribute such as `description`, `technology`, or a project-specific field:

```insight
system billing # Maintained in the finance repository
    name = Billing
    description = Records charges, invoices, and settlement state
```

Here the note helps an editor find the source of ownership, while `description` becomes part of the architecture model and can be presented to diagram readers.

## Placement

Standalone comments can be placed around declarations and assignments without changing indentation ownership. An inline note stays on the declaration line after the identifier or relationship target:

```insight
service order_fulfillment # Runtime owner: commerce
    links:
        ~> checkout # Reacts after an order is accepted
            technology = Kafka
            via = orders.created
```

Attribute values continue to the end of their line, so `#` inside an assignment is stored as part of its text rather than starting a note:

```insight
service search
    description = Indexes products # including archived products
```

In this example the complete text after `=` belongs to `description`. Put explanatory source comments on their own line when they accompany an attribute.
