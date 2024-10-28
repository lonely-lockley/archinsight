package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;

import java.util.*;
import java.util.stream.Collectors;

public interface Relocation {

    default void remapContexts(TranslationContext ctx) {
        final var namespaces = ctx.getDescriptors()
                .stream()
                .collect(Collectors.groupingBy(
                        ParseDescriptor::getLevel,
                        Collectors.groupingBy(ParseDescriptor::getBoundedContext, Collectors.toList())
                ));
        // containers must be first to remap
        final var tmp = new ArrayList<>(ctx.getDescriptors());
        tmp.sort(Comparator.comparing(ParseDescriptor::getLevel).reversed());
        for (ParseDescriptor descriptor : tmp) {
            final var remapping = new HashMap<String, String>();
            descriptor.getImports().forEach(imported -> {
                remapImport(imported, remapping, namespaces, descriptor, ctx);
            });
            rewriteConnections(descriptor, remapping);
            if (descriptor.getLevel() == ArchLevel.CONTEXT) {
                pushConnections(descriptor, namespaces.get(ArchLevel.CONTAINER).getOrDefault(descriptor.getBoundedContext(), Collections.emptyList()), remapping);
            }
        }
    }

    private void remapImport(AbstractImport imported, HashMap<String, String> remapping, Map<ArchLevel, Map<String, List<ParseDescriptor>>> namespaces, ParseDescriptor descriptor, TranslationContext ctx) {
        final var importedDescriptor = findNamespace(imported, namespaces);
        if (descriptor.getLevel() == ArchLevel.CONTEXT && imported.getLevel() == ArchLevel.CONTEXT) {
            fromContextToContext(imported, remapping, importedDescriptor, descriptor, ctx);
        }
        else
        if (descriptor.getLevel() == ArchLevel.CONTEXT && imported.getLevel() == ArchLevel.CONTAINER) {
            fromContextToContainer(imported, remapping, importedDescriptor, descriptor, ctx);
        }
        else
        if (descriptor.getLevel() == ArchLevel.CONTAINER && imported.getLevel() == ArchLevel.CONTEXT) {
            fromContainerToContext(imported, remapping, importedDescriptor, descriptor, ctx);
        }
        else {
            fromContainerToContainer(imported, remapping, importedDescriptor, descriptor, ctx);
        }
    }

    private void fromContextToContainer(AbstractImport imported, HashMap<String, String> remapping, ParseDescriptor importedDescriptor, ParseDescriptor descriptor, TranslationContext ctx) {
        if (descriptor != importedDescriptor.getParentContext()) {
            var id = importedDescriptor.getRootWithId().getDeclaredId();
            var parent = importedDescriptor.getParentContext();
            var element = parent.getDeclared(imported.getIdentifier());
            var newId = String.format("%s__%s", parent.getId(), id);
            if (!descriptor.exists(newId)) {
                descriptor.declareImported(newId, LinkHelper.transformToImported(element.clone(), newId, descriptor));
            }
            remapping.put(imported.getAlias(), newId);
        }
        else {
            var id = importedDescriptor.getRootWithId().getDeclaredId();
            if (descriptor.isImported(id)) {
                descriptor.removeExisting(imported.getAlias());
            }
            remapping.put(imported.getAlias(), imported.getIdentifier());
        }
    }

    private void fromContextToContext(AbstractImport imported, HashMap<String, String> remapping, ParseDescriptor importedDescriptor, ParseDescriptor descriptor, TranslationContext ctx) {
        if (descriptor != importedDescriptor) {
            var element = importedDescriptor.getDeclared(imported.getIdentifier());
            var newId = String.format("%s__%s", importedDescriptor.getId(), imported.getIdentifier());
            descriptor.removeExisting(imported.getAlias());
            descriptor.declareImported(newId, LinkHelper.transformToImported(element.clone(), newId, descriptor));
            remapping.put(imported.getAlias(), newId);
        }
        else {
            if (descriptor.isImported(imported.getAlias())) {
                descriptor.removeExisting(imported.getAlias());
            }
            remapping.put(imported.getAlias(), imported.getIdentifier());
        }
    }

    private void fromContainerToContext(AbstractImport imported, HashMap<String, String> remapping, ParseDescriptor importedDescriptor, ParseDescriptor descriptor, TranslationContext ctx) {
        if (descriptor.getParentContext() != importedDescriptor) {
            var element = importedDescriptor.getDeclared(imported.getIdentifier());
            var newId = String.format("%s__%s", importedDescriptor.getId(), imported.getIdentifier());
            descriptor.removeExisting(imported.getAlias());
            if (!descriptor.exists(newId)) {
                descriptor.declareImported(newId, LinkHelper.transformToImported(element.clone(), newId, descriptor));
            }
            remapping.put(imported.getAlias(), newId);
        }
        else {
            if (descriptor.isImported(imported.getAlias())) {
                descriptor.removeExisting(imported.getAlias());
            }
            remapping.put(imported.getAlias(), imported.getIdentifier());
        }
    }

    private void fromContainerToContainer(AbstractImport imported, HashMap<String, String> remapping, ParseDescriptor importedDescriptor, ParseDescriptor descriptor, TranslationContext ctx) {
        if (descriptor != importedDescriptor) {
            var element = importedDescriptor.getDeclared(imported.getElement());
            var newId = String.format("%s__%s", importedDescriptor.getId(), imported.getElement());
            if (!descriptor.exists(newId)) {
                descriptor.declareImported(newId, LinkHelper.transformToImported(element.clone(), newId, descriptor));
            }
            remapping.put(String.format("%s__%s", imported.getAlias(), imported.getElement()), newId);
        }
        else {
            var id = importedDescriptor.getRootWithId().getDeclaredId();
            if (descriptor.isImported(id)) {
                descriptor.removeExisting(imported.getAlias());
            }
            remapping.put(imported.getAlias(), imported.getIdentifier());
        }
    }

    private ParseDescriptor findNamespace(AbstractImport imported, Map<ArchLevel, Map<String, List<ParseDescriptor>>> namespaces) {
        return namespaces
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
            var id = desc.getRootWithId().getDeclaredId();
            desc.getConnections().forEach(link -> {
                if (desc.isImported(link.getTo())) {
                    var copy = (LinkElement) link.clone();
                    copy.setFrom(id);
                    copy.setTo(remapping.containsKey(link.getTo()) ? remapping.get(link.getTo()) : link.getTo());
                    descriptor.addConnection(copy);
                    descriptor.getRootWithChildren().addChild(copy);
                }
            });
        });
    }

}
