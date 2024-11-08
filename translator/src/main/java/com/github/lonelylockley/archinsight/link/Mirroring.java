package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.DynamicId;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.elements.ElementType;

import java.util.stream.Collectors;

public interface Mirroring {

    default void addMirrorConnections(ParseDescriptor descriptor, TranslationContext ctx) {
        // original descriptor with import statement that has to be mirrored
        descriptor.getImports().forEach(imp -> {
            var targetId = DynamicId.fromImport(imp);
            targetId.setElementId(null);
//            System.err.println(targetId + " --- " + ctx.getGlobalElement(targetId));
        });
        System.err.println();
    }

/*
        // original descriptor with import statement that has to be mirrored
        var descriptorToContextBoundary = descriptor
                .listImported()
                .stream()
                .filter(id -> descriptor.getImported(id).getType() != ElementType.EMPTY)
                .map(id -> {
                    var pos = id.lastIndexOf("__");
                    return new Tuple2<>(id, new Tuple2<>(id.substring(pos + 2), ctx.getDescriptor(id.substring(0, pos))));
                })
                .collect(Collectors.toMap(
                        Tuple2::_1,
                        Tuple2::_2
                ));
        descriptor
                .getConnections()
                .stream()
                .filter(connection -> descriptorToContextBoundary.get(connection.getTo()) != null)
                .filter(connection -> descriptor.isImported(connection.getTo()))
                .forEach(connection -> {
                    // target descriptor to mirror element and link
                    final var targetId = descriptorToContextBoundary.get(connection.getTo())._1;
                    final var targetDescriptor = descriptorToContextBoundary.get(connection.getTo())._2;
                    if (targetDescriptor != null) {
                        // mirrored element referencing imported element
                        var mirrored = descriptor.getExisting(connection.getFrom()).clone();
                        var alreadyImported = targetDescriptor
                                .getImports()
                                .stream()
                                .filter(imp -> {
                                    return Objects.equals(imp.getBoundedContext(), descriptor.getBoundedContext()) && Objects.equals(imp.getIdentifier(), connection.getFrom());
                                })
                                .findFirst();
                        String newId;
                        if (alreadyImported.isPresent()) {
                            newId = alreadyImported.get().getAlias();
                        }
                        else {
                            newId = String.format("%s__%s", descriptor.getId(), connection.getFrom());
                        }
                        // - if original element is not imported into target namespace
                        if (!targetDescriptor.exists(newId)) {
                            LinkHelper.transformToImported(mirrored, newId, targetDescriptor);
                            targetDescriptor.declareMirrored(newId, mirrored);
                        }
//                        // create a reversed link from mirrored element to imported one
                        var reverseLink = (LinkElement) connection.clone();
//                        // copy link and reverse direction
                        reverseLink.setFrom(newId);
                        reverseLink.setTo(targetId);
                        targetDescriptor.addConnection(reverseLink);
                        targetDescriptor.getRootWithChildren().addChild(reverseLink);
                        if (targetDescriptor.getParentContext() != null) {
                            var reverseCopy = (LinkElement) reverseLink.clone();
                            reverseCopy.setTo("??");
                            targetDescriptor.getParentContext().addConnection(reverseCopy);
                            targetDescriptor.getParentContext().getRootWithChildren().addChild(reverseCopy);
                        }
                    }
                });
    }
*/
}
