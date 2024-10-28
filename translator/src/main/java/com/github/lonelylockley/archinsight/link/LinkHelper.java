package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.ContainerDescriptor;
import com.github.lonelylockley.archinsight.model.ContextDescriptor;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.elements.WithExternal;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;

class LinkHelper {

    static String createBoundedContextUniqueId(ArchLevel level, AbstractImport imported) {
        if (level == ArchLevel.CONTEXT) {
            return ContextDescriptor.createContextDescriptorId(level, imported.getBoundedContext());
        }
        else
        if (level == ArchLevel.CONTAINER) {
            return ContainerDescriptor.createContainerDescriptorId(level, imported.getBoundedContext(), imported.getIdentifier());
        }
        else {
            throw new IllegalArgumentException("Don't know how to create id for level = " + level);
        }
    }

    static AbstractElement transformToImported(AbstractElement copy, String newId, ParseDescriptor descriptor) {
        copy.hasId().foreach(c -> c.setDeclaredId(newId));
        copy.hasChildren().foreach(c -> c.getChildren().clear());
        copy.hasExternal().foreach(WithExternal::setExternal);
        descriptor.getRootWithChildren().addChild(copy);
        return copy;
    }
}
