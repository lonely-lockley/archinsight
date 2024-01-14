package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;

import java.util.*;

public class TranslationContext {

    private HashMap<String, ParsedFileDescriptor> descriptors = new HashMap<>();
    private ArrayList<TranslatorMessage> messages = new ArrayList<>();
    private boolean hasErrors = false;

    public Collection<ParsedFileDescriptor> getDescriptors() {
        return descriptors.values();
    }

    public ParsedFileDescriptor getDescriptor(String id) {
        return descriptors.get(id);
    }

    public ArrayList<TranslatorMessage> getMessages() {
        return messages;
    }

    public void addDescriptors(ArrayList<ParsedFileDescriptor> descriptors) {
        for (ParsedFileDescriptor descriptor : descriptors){
            this.descriptors.put(descriptor.getId(), descriptor);
        }
    }

    public void addDescriptor(ParsedFileDescriptor descriptor) {
        this.descriptors.put(descriptor.getId(), descriptor);
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

    public boolean hasErrors() {
        return hasErrors;
    }
}
