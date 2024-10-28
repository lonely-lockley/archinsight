package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;

public interface Connections {

    default void checkConnections(ParseDescriptor descriptor, TranslationContext ctx) {
        descriptor.getConnections()
                .stream()
                .filter(link ->
                        !(descriptor.exists(link.getTo())))
//                .filter(link ->
//                        !(descriptor.getParentContext() != null && descriptor.getParentContext().exists(link.getTo()))
//                )
//                .filter(link ->
//                        !(link.getTo().startsWith("CONTEXT_") || link.getTo().startsWith("CONTAINER_")))
                .forEach(link -> {
                    var tm = TranslationUtil.newError(link,
                            String.format("Undeclared identifier %s", link.getTo())
                    );
                    ctx.addMessage(tm);
                });
    }

}
