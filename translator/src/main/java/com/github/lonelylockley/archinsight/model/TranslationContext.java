package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class TranslationContext {

    private final HashMap<DynamicId, AbstractElement> globalDeclaration = new HashMap<>();
    private final ConcurrentHashMap<Origin, ParseDescriptor> raw = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<DynamicId, ParseDescriptor> descriptors = new ConcurrentHashMap<>();
    private final Set<TranslatorMessage> messages = new HashSet<>();
    private boolean hasErrors = false;

    public Collection<ParseDescriptor> getDescriptors() {
        return descriptors.values();
    }

    public Collection<ParseDescriptor> getRaw() {
        return raw.values();
    }

    public ParseDescriptor getDescriptor(DynamicId id) {
        return descriptors.get(id);
    }

    public boolean hasDescriptor(DynamicId id) {
        return descriptors.containsKey(id);
    }

    public Set<TranslatorMessage> getMessages() {
        return messages;
    }

    public void addDescriptor(ParseDescriptor descriptor) {
        descriptors.put(descriptor.getId(), descriptor);
    }

    public void addRaw(Origin origin, ParseDescriptor descriptor) {
        raw.put(origin, descriptor);
    }

    public void addMessages(ArrayList<TranslatorMessage> messages) {
        this.messages.addAll(messages);
    }

    public void addMessage(TranslatorMessage message) {
        if (message.getLevel() == MessageLevel.ERROR) {
            hasErrors = true;
        }
        this.messages.add(message);
    }

    public boolean noErrors() {
        return !hasErrors;
    }

    public boolean hasErrors() {
        return hasErrors;
    }

    public void declareGlobalElement(DynamicId id, AbstractElement element) {
        globalDeclaration.put(id, element);
    }

    public AbstractElement getGlobalElement(DynamicId id) {
        return globalDeclaration.get(id);
    }

    public boolean isDeclaredGlobally(DynamicId id) {
        return globalDeclaration.containsKey(id);
    }
}
