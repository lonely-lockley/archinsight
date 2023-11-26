package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.elements.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Linker {

    private static final Logger logger = LoggerFactory.getLogger(Linker.class);

    private final Map<String, ParsedFileDescriptor> namespaces = new HashMap<>();
    private final TranslationContext ctx;

    public Linker(TranslationContext ctx) {
        this.ctx = ctx;
    }

    private void rewriteNamedImports() {

    }

    private void checkNamespace(ParsedFileDescriptor descriptor) {
        // LId - level id
        var namespaceLId = String.format("%s:%s", descriptor.getLevel(), descriptor.getNamespace());
        if (namespaces.containsKey(namespaceLId)) {
            TranslatorMessage lm = new TranslatorMessage(
                    MessageLevel.WARNING,
                    descriptor.getId(),
                    descriptor.getLocation(),
                    String.format("Duplicate namespace definition declared in file %s", namespaces.get(namespaceLId).getLocation())
            );
            Util.copyPosition(lm, descriptor.getParseResult().getRoot());
            ctx.addMessage(lm);
        }
        else {
            namespaces.put(namespaceLId, descriptor);
        }
    }

    private void checkNamespaces(List<ParsedFileDescriptor> projectDescriptors, ParsedFileDescriptor edited) {
        for (ParsedFileDescriptor descriptor: projectDescriptors) {
            checkNamespace(descriptor);
        }
        checkNamespace(edited);
    }

    private void checkDeclarations(ParsedFileDescriptor descriptor, AbstractElement el) {
        if (el.getType() == ElementType.LINK) {
            if (descriptor.getConnections().contains((LinkElement) el)) {
                TranslatorMessage lm = new TranslatorMessage(
                        MessageLevel.WARNING,
                        descriptor.getId(),
                        descriptor.getLocation(),
                        "Possible link duplication"
                );
                Util.copyPosition(lm, el);
                ctx.addMessage(lm);
            }
            else {
                descriptor.connect((LinkElement) el);
            }
        }
        else
        if (el.getType() != ElementType.CONTEXT && el.getType() != ElementType.CONTAINER) {
            if (descriptor.isDeclared(el)) {
                TranslatorMessage lm = new TranslatorMessage(
                        MessageLevel.ERROR,
                        descriptor.getId(),
                        descriptor.getLocation(),
                        String.format("Identifier %s is already defined", ((WithId) el).getId())
                );
                Util.copyPosition(lm, el);
                ctx.addMessage(lm);
            }
            else {
                descriptor.declare(el);
            }
        }
        if (el instanceof WithImports hasImports) {
            descriptor.declareForeign(hasImports);
        }
        if (el instanceof WithChildElements hasChildren) {
            hasChildren.getChildren().forEach(ch -> checkDeclarations(descriptor, ch));
        }
    }

    private void checkConnections(ParsedFileDescriptor descriptor) {
        descriptor.getConnections()
            .stream()
            .filter(c -> !descriptor.isDeclared(c.getTo()))
            .forEach(el -> {
                TranslatorMessage lm = new TranslatorMessage(
                        MessageLevel.ERROR,
                        descriptor.getId(),
                        descriptor.getLocation(),
                        String.format("Undeclared identifier %s", el.getTo())
                );
                Util.copyPosition(lm, el);
                ctx.addMessage(lm);
            });
    }

    public void checkIntegrity() {
        var edited = ctx.getEdited();
        checkNamespaces(ctx.getDescriptors(), edited);
        checkDeclarations(edited, edited.getParseResult().getRoot());
        checkConnections(edited);
    }

}
