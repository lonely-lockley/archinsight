package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import com.github.lonelylockley.archinsight.model.elements.*;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

public class Linker {

    private final Map<String, Tuple2<String, AbstractImport>> declaredImports = new HashMap<>();
    private final TranslationContext ctx;

    private Map<String, ParseDescriptor> namespaces;

    public Linker(TranslationContext ctx) {
        this.ctx = ctx;
    }

    private WithChildElements transformToImported(AbstractElement copy, AbstractImport imported, AbstractElement root, ParseDescriptor descriptor) {
        TranslationUtil.copyPosition(copy, imported.getIdentifierSource());
        copy.hasId().foreach(c -> c.setDeclaredId(imported.getAlias()));
        copy.hasChildren().foreach(c -> c.getChildren().clear());
        copy.hasExternal().foreach(WithExternal::setExternal);
        // attach named imports to current container and anonymous imports to root container
        var container = root.hasChildren().mapOrElse(
                Function.identity(),
                () -> descriptor.getRoot().hasChildren().mapOrElse(Function.identity(), () -> { throw new RuntimeException("Could not find a suitable candidate to add imports"); })
        );
        return container;
    }

    private void rewriteSingleImport(String namespaceUId, AbstractImport imported, AbstractElement root, ParseDescriptor descriptor) {
        // if an element contains errors we still have to register empty element to declarations
        // to satisfy declarations check for anonymous imports
        AbstractElement copy = new EmptyElement(imported.getAlias());
        // check namespace exists
        if (!namespaces.containsKey(namespaceUId)) {
            var tm = TranslationUtil.newError(imported,
                String.format("Unsatisfied import: %s %s not found", TranslationUtil.stringify(imported.getLevel()), imported.getBoundedContext())
            );
            TranslationUtil.copyPosition(tm, imported.getLine(), imported.getLevelSource().getCharPosition(), imported.getLevelSource().getStartIndex(), imported.getBoundedContextSource().getStopIndex());
            ctx.addMessage(tm);
        }
        else
        // check that imported element is declared in namespace
        if (!namespaces.get(namespaceUId).exists(imported.getIdentifier())) {
            var tm = TranslationUtil.newError(imported,
                String.format("Unsatisfied import: %s%s not found in %s %s", imported.getElement() == null ? "" : imported.getElement() + " ", imported.getIdentifier(), TranslationUtil.stringify(imported.getLevel()), imported.getBoundedContext())
            );
            TranslationUtil.copyPosition(tm, imported.getLine(), imported.getIdentifierSource().getCharPosition(), imported.getIdentifierSource().getStartIndex(), imported.getIdentifierSource().getStopIndex());
            ctx.addMessage(tm);
        }
        else
        // check imported element is not a boundary
        if (namespaces.get(namespaceUId) != null && namespaces.get(namespaceUId).getExisting(imported.getAlias()) != null && Objects.equals(namespaces.get(namespaceUId).getExisting(imported.getIdentifier()).getType(), ElementType.BOUNDARY)) {
            var tm = TranslationUtil.newError(imported,
                    "Boundary cannot be imported"
            );
            TranslationUtil.copyPosition(tm, imported.getLine(), imported.getIdentifierSource().getCharPosition(), imported.getIdentifierSource().getStartIndex(), imported.getIdentifierSource().getStopIndex());
            ctx.addMessage(tm);
        }
        else {
            // finally, if no problems found, create element copy
            var originalDescriptor = namespaces.get(namespaceUId);
            var originalElement = namespaces.get(namespaceUId).getExisting(imported.getIdentifier());
            imported.setOrigination(originalDescriptor, originalElement);
            copy = originalElement.clone();
            copy.hasExternal().filter(WithExternal::isExternal).foreach(external -> {
                var tm = TranslationUtil.newError(imported,
                    "External element imported"
                );
                var charPosition = imported.getElementSource() == null ? imported.getIdentifierSource().getCharPosition() : imported.getElementSource().getCharPosition();
                var start = imported.getElementSource() == null ? imported.getIdentifierSource().getStartIndex() : imported.getElementSource().getStartIndex();
                var stop = imported.getIdentifierSource().getStopIndex();
                TranslationUtil.copyPosition(tm, imported.getLine(), charPosition, start, stop);
                ctx.addMessage(tm);
            });
        }
        if (copy.getType() != ElementType.EMPTY) {
            // copy position and fix copied attributes if needed
            var container = transformToImported(copy, imported, root, descriptor);
            container.addChild(copy);
            descriptor.declareImported(copy.hasId().mapOrElse(WithId::getDeclaredId, null), copy);
        }
    }

    private String createBoundedContextUniqueId(AbstractImport imported) {
        if (imported.getLevel() == ArchLevel.CONTEXT) {
            return String.format("%s__%s", imported.getLevel(), imported.getBoundedContext());
        }
        else
        if (imported.getLevel() == ArchLevel.CONTAINER) {
            return String.format("%s__%s__%s", imported.getLevel(), imported.getBoundedContext(), imported.getElement());
        }
        else {
            throw new IllegalArgumentException("Don't know how to create id for level = " + imported.getLevel());
        }
    }

    private void rewriteImportsInternal(AbstractElement root, ParseDescriptor descriptor) {
        root.hasImports().foreach(hasImports -> {
            for (AbstractImport imported : hasImports.getImports()) {
                if (!imported.isAnonymous()) {
                    var namespaceUId = createBoundedContextUniqueId(imported);
                    // create map for future use in mirroring
                    declaredImports.put(imported.getAlias(), new Tuple2<>(namespaceUId, imported));
                }
            }
            for (AbstractImport imported : hasImports.getImports()) {
                if (imported.isAnonymous()) {
                    var bc = declaredImports.get(imported.getElement());
                    if (bc != null) {
                        var system = bc._2;
                        imported.setBoundedContext(system.getBoundedContext());
                        imported.setBoundedContextSource(system.getBoundedContextSource());
                        imported.setLevel(ArchLevel.CONTAINER);
                        imported.setElement(bc._2.getIdentifier());
                        imported.setLevelSource(system.getLevelSource());
                        rewriteSingleImport(createBoundedContextUniqueId(imported), imported, root, descriptor);
                    }
                    else {
                        var tm = TranslationUtil.newError(imported,
                            String.format("Identifier %s not found", imported.getElement())
                        );
                        TranslationUtil.copyPosition(tm, imported.getLine(), imported.getElementSource().getCharPosition(), imported.getElementSource().getStartIndex(), imported.getElementSource().getStopIndex());
                        ctx.addMessage(tm);
                    }
                }
                else {
                    rewriteSingleImport(createBoundedContextUniqueId(imported), imported, root, descriptor);
                }
            }
        });
    }

    private void rewriteImports(ParseDescriptor descriptor) {
        var root = descriptor.getRoot();
        rewriteImportsInternal(root, descriptor);
        root.hasChildren().foreach(hasChildren -> {
            // copy children into a new collection before they were rewritten to avoid concurrent modification exception
            var children = new ArrayList<AbstractElement>(hasChildren.getChildren().size());
            children.addAll(hasChildren.getChildren());
            children.forEach(ch -> rewriteImportsInternal(ch, descriptor));
        });
    }

    private void addMirrorConnections(ParseDescriptor descriptor) {
        // original descriptor with import statement that has to be mirrored
        descriptor
                .getConnections()
                .stream()
                .filter(le -> declaredImports.containsKey(le.getTo()))
                .forEach(le -> {
                    // original_to alias -> (namespaceLId, original import)
                    var namespaceAndImportStatement = declaredImports.get(le.getTo());
                    // original element referencing imported element
                    var originalFromElement = descriptor.getExisting(le.getFrom());
                    if (originalFromElement == null) {
                        return;
                    }
                    // mirrored element
                    var mirrored = originalFromElement.clone();
                    // target descriptor to mirror element and link
                    var targetDescriptor = namespaces.get(namespaceAndImportStatement._1);
                    if (targetDescriptor != null) {
                        // container element in target descriptor with mirror element added
                        var container = transformToImported(mirrored, namespaceAndImportStatement._2, targetDescriptor.getRoot(), targetDescriptor);
                        var alreadyImported = targetDescriptor
                                .getImports()
                                .stream()
                                .filter(imp -> {
                                    return Objects.equals(imp.getBoundedContext(), descriptor.getBoundedContext()) && Objects.equals(imp.getIdentifier(), le.getFrom());
                                })
                                .findFirst();
                        String newId;
                        if (alreadyImported.isPresent()) {
                            newId = alreadyImported.get().getAlias();
                        }
                        else {
                            newId = String.format("%s__%s", descriptor.getId(), le.getFrom());
                        }
                        mirrored.hasId().foreach(withId -> withId.setDeclaredId(newId));
                        // - if original element is imported into target namespace
                        if (!targetDescriptor.isDeclared(newId)) {
                            container.addChild(mirrored);
                            targetDescriptor.declareMirrored(newId, mirrored);
                        }
                        // create a reversed link from mirrored element to imported one
                        var reverseLink = (LinkElement) le.clone();
                        // copy link and reverse direction
                        reverseLink.setFrom(newId);
                        if (namespaceAndImportStatement._2.getOriginalElement() != null) {
                            reverseLink.setTo(namespaceAndImportStatement._2.getOriginalElement().hasId().mapOrElse(WithId::getDeclaredId, null));
                        }
                        targetDescriptor.addConnection(reverseLink);
                        container.addChild(reverseLink);
                    }
                });
        declaredImports.clear();
    }

    private void rewriteBoundedContexts(Collection<ParseDescriptor> descriptors) {
        namespaces = descriptors
                        .stream()
                        .collect(Collectors.toMap(
                                ParseDescriptor::getId,
                                Function.identity(),
                                AdapterDescriptor::new
                        ));
    }

    private void checkDeclarations(ParseDescriptor descriptor, AbstractElement el) {
        if (el.getType() == ElementType.LINK) {
            ElementType.LINK.capture(el).foreach(link -> {
                if (descriptor.getConnections().contains(link)) {
                    var tm = TranslationUtil.newWarning(el,
                            "Possible link duplication"
                    );
                    ctx.addMessage(tm);
                }
                else {
                    descriptor.addConnection(link);
                }
            });
        }
        else
        if (el.getType() != ElementType.CONTEXT && el.getType() != ElementType.CONTAINER) {
            var id = el.hasId().mapOrElse(WithId::getDeclaredId, () -> {
                throw new RuntimeException(String.format("Element of type %s is not supposed to have an identifier", el.getType()));
            });
            if (descriptor.exists(id)) {
                var tm = TranslationUtil.newError(el,
                    String.format("Identifier %s is already defined", id)
                );
                ctx.addMessage(tm);
            }
            else {
                descriptor.declareElement(id, el);
            }
        }
        el.hasImports().foreach(imports -> {
            imports.getImports().forEach(imp -> {
                    var id = imp.getAlias();
                    if (descriptor.exists(id)) {
                        var tm = TranslationUtil.newError(el, String.format("Identifier %s is already defined", id));
                        ctx.addMessage(tm);
                    } else {
                        descriptor.declareImported(id, el);
                    }
                });
        });
        el.hasChildren().foreach(hasChildren -> hasChildren.getChildren().forEach(ch -> checkDeclarations(descriptor, ch)));
    }

    private void checkConnections(ParseDescriptor descriptor) {
        descriptor.getConnections()
            .stream()
            .filter(c -> !descriptor.exists(c.getTo()))
            .filter(c -> descriptor.getParentContext() != null && !descriptor.getParentContext().exists(c.getTo()))
            .filter(c -> !(c.getTo().startsWith("CONTEXT_") || c.getTo().startsWith("CONTAINER_")))
            .forEach(el -> {
                var tm = TranslationUtil.newError(el,
                    String.format("Undeclared identifier %s", el.getTo())
                );
                ctx.addMessage(tm);
            });
    }

    public void checkIntegrity() {
        rewriteBoundedContexts(ctx.getDescriptors());
        for (ParseDescriptor descriptor : namespaces.values()) {
            checkDeclarations(descriptor, descriptor.getRoot());
        }
        for (ParseDescriptor descriptor : namespaces.values()) {
            rewriteImports(descriptor);
            addMirrorConnections(descriptor);
            checkConnections(descriptor);
        }
    }

}
