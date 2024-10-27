package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.elements.*;

import java.util.*;
import java.util.stream.Collectors;

public interface Relocation {

    default void remapContexts(TranslationContext ctx) {
        var namespaces = ctx.getDescriptors()
                .stream()
                .collect(Collectors.groupingBy(
                        ParseDescriptor::getLevel,
                        Collectors.groupingBy(ParseDescriptor::getBoundedContext, Collectors.toList())
                ));
        // containers must be first to remap
        var tmp = new ArrayList<>(ctx.getDescriptors());
        tmp.sort(Comparator.comparing(ParseDescriptor::getLevel).reversed());
        // ----
        for (ParseDescriptor descriptor : tmp) {
            final var remapping = new HashMap<String, String>();
            final var importHistory = new HashMap<AbstractElement, String>();
            descriptor.getImports().forEach(imported -> {
                    var importedDescriptor = namespaces
                            .get(imported.getLevel())
                            .get(imported.getBoundedContext())
                            .stream()
                            .filter(d -> {
                                if (d.getLevel() == ArchLevel.CONTEXT) {
                                    return d.isDeclared(imported.getIdentifier());
                                }
                                else {
                                    return d.isDeclared(imported.getElement());
                                }
                            })
                            .findFirst()
                            .get(); // !!! after import checks we MUST NOT fail here
                    if (importedDescriptor.getLevel() == ArchLevel.CONTAINER && descriptor != importedDescriptor.getParentContext()) {
                        var id = importedDescriptor.getRoot().hasId().fold(WithId::getDeclaredId, () -> { throw new IllegalStateException("Descriptor root must have an id"); });
                        var parent = importedDescriptor.getParentContext();
                        var element = parent.getDeclared(id);
                        if (!importHistory.containsKey(element)) {
                            var newId = String.format("%s__%s", parent.getId(), imported.getElement());
                            descriptor.removeExisting(imported.getAlias());
                            descriptor.declareImported(newId, LinkHelper.transformToImported(element.clone(), newId, descriptor));
                            remapping.put(imported.getAlias(), newId);
                            importHistory.put(element, newId);
                        }
                    }
                    else
                    if (importedDescriptor.getLevel() == ArchLevel.CONTAINER && descriptor == importedDescriptor.getParentContext()) {
                        var id = importedDescriptor.getRoot().hasId().fold(WithId::getDeclaredId, () -> { throw new IllegalStateException("Descriptor root must have an id"); });
                        if (descriptor.isImported(id)) {
                            descriptor.removeExisting(imported.getAlias());
                            remapping.put(imported.getAlias(), imported.getIdentifier());
                        }
                    }
                    else
                    if (importedDescriptor.getLevel() == ArchLevel.CONTEXT && descriptor != importedDescriptor) {
                        var element = importedDescriptor.getDeclared(imported.getIdentifier());
                        if (!importHistory.containsKey(element)) {
                            var newId = String.format("%s__%s", importedDescriptor.getId(), imported.getIdentifier());
                            descriptor.removeExisting(imported.getAlias());
                            descriptor.declareImported(newId, LinkHelper.transformToImported(element.clone(), newId, descriptor));
                            remapping.put(imported.getAlias(), newId);
                            importHistory.put(element, newId);
                        }
                    }
                    else
                    if (importedDescriptor.getLevel() == ArchLevel.CONTEXT && descriptor == importedDescriptor) {
                        if (descriptor.isImported(imported.getAlias())) {
                            descriptor.removeExisting(imported.getAlias());
                            remapping.put(imported.getAlias(), imported.getIdentifier());
                        }
                    }
                });
            rewriteConnections(descriptor, remapping);
            if (descriptor.getLevel() == ArchLevel.CONTEXT) {
                pushConnections(descriptor, namespaces.get(ArchLevel.CONTAINER).getOrDefault(descriptor.getBoundedContext(), Collections.emptyList()), remapping);
            }
        }
    }

    private void rewriteConnections(ParseDescriptor descriptor, HashMap<String, String> remapping) {
        descriptor.getConnections().forEach(link -> {
            if (remapping.containsKey(link.getTo())) {
                link.setTo(remapping.get(link.getTo()));
            }
        });
    }

    private void pushConnections(ParseDescriptor descriptor, List<ParseDescriptor> containers, HashMap<String, String> remapping) {
        containers.forEach(desc -> {
            var id = desc.getRoot().hasId().fold(WithId::getDeclaredId, () -> { throw new IllegalStateException("Descriptor root must have an id"); });
            desc.getConnections().forEach(link -> {
                if (desc.isImported(link.getTo())) {
                    var copy = (LinkElement) link.clone();
                    copy.setFrom(id);
                    copy.setTo(remapping.containsKey(link.getTo()) ? remapping.get(link.getTo()) : link.getTo());
                    descriptor.addConnection(copy);
                    descriptor.getRoot().hasChildren().foreach(withChildElements -> withChildElements.addChild(copy));
                }
            });
        });
    }

}
