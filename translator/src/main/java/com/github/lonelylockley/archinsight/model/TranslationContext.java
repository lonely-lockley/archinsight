package com.github.lonelylockley.archinsight.model;

import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;

import java.util.ArrayList;

public class TranslationContext {

    private ArrayList<ParsedFileDescriptor> descriptors = new ArrayList<>();
    private ParsedFileDescriptor edited;
    private ArrayList<TranslatorMessage> messages = new ArrayList<>();

    public void setEdited(ParsedFileDescriptor edited) {
        this.edited = edited;
    }

    public ArrayList<ParsedFileDescriptor> getDescriptors() {
        return descriptors;
    }

    public ParsedFileDescriptor getEdited() {
        return edited;
    }

    public ArrayList<TranslatorMessage> getMessages() {
        return messages;
    }

    public void addDescriptors(ArrayList<ParsedFileDescriptor> descriptors) {
        this.descriptors.addAll(descriptors);
    }

    public void addDescriptor(ParsedFileDescriptor descriptor) {
        this.descriptors.add(descriptor);
    }

    public void addMessages(ArrayList<TranslatorMessage> messages) {
        this.messages.addAll(messages);
    }

    public void addMessage(TranslatorMessage message) {
        this.messages.add(message);
    }

}
