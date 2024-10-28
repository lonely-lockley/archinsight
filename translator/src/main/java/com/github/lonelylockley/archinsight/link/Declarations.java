package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.elements.*;

public interface Declarations {

    default void declareConnection(LinkElement link, ParseDescriptor descriptor, TranslationContext ctx) {
        if (descriptor.getConnections().contains(link)) {
            var tm = TranslationUtil.newWarning(link,
                    String.format("Link from %s to %s is already defined", link.getFrom(), link.getTo())
            );
            ctx.addMessage(tm);
        }
        else {
            descriptor.addConnection(link);
        }
    }

    default void declareElement(ActorElement act, ParseDescriptor descriptor, TranslationContext ctx) {
        declareElement(act.getDeclaredId(), act, descriptor, ctx);
    }

    default void declareElement(SystemElement sys, ParseDescriptor descriptor, TranslationContext ctx) {
        declareElement(sys.getDeclaredId(), sys, descriptor, ctx);
    }

    default void declareElement(ServiceElement srv, ParseDescriptor descriptor, TranslationContext ctx) {
        declareElement(srv.getDeclaredId(), srv, descriptor, ctx);
    }

    default void declareElement(StorageElement str, ParseDescriptor descriptor, TranslationContext ctx) {
        declareElement(str.getDeclaredId(), str, descriptor, ctx);
    }

    private void declareElement(String id, AbstractElement el, ParseDescriptor descriptor, TranslationContext ctx) {
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

}
