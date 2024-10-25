package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class TranslationContext {

    private final ConcurrentHashMap<String, ParseDescriptor> descriptors = new ConcurrentHashMap<>();
    private final Set<TranslatorMessage> messages = new HashSet<>();
    private boolean hasErrors = false;

    public Collection<ParseDescriptor> getDescriptors() {
        return descriptors.values();
    }

    public ParseDescriptor getDescriptor(String id) {
        return descriptors.get(id);
    }

    public boolean hasDescriptor(String id) {
        return descriptors.containsKey(id);
    }

    public Set<TranslatorMessage> getMessages() {
        return messages;
    }

    public void addDescriptors(ArrayList<ParseDescriptor> descriptors) {
        for (ParseDescriptor descriptor : descriptors){
            this.descriptors.put(descriptor.getId(), descriptor);
        }
    }

    public void addDescriptor(ParseDescriptor descriptor) {
        var origin = descriptor.getRoot().getOrigin();
        this.descriptors.put(String.format("%s__%s", descriptor.getLevel(),  origin.getTab().isPresent() ? origin.getTabId() : origin.getFileId().toString()), descriptor);
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
}
