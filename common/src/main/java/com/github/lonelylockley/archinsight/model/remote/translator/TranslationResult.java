package com.github.lonelylockley.archinsight.model.remote.translator;

import java.util.Collections;
import java.util.List;

public class TranslationResult extends TranslationRequest {

    private List<TranslatorMessage> messages = Collections.emptyList();
    private List<DeclarationContext> declarations = Collections.emptyList();
    private boolean hasErrors = false;
    private TabData edited;

    public List<TranslatorMessage> getMessages() {
        return messages;
    }

    public void setMessages(List<TranslatorMessage> messages) {
        this.messages = messages;
    }

    public boolean isHasErrors() {
        return hasErrors;
    }

    public void setHasErrors(boolean hasErrors) {
        this.hasErrors = hasErrors;
    }

    public TabData getEdited() {
        return edited;
    }

    public void setEdited(TabData edited) {
        this.edited = edited;
    }

    public List<DeclarationContext> getDeclarations() {
        return declarations;
    }

    public void setDeclarations(List<DeclarationContext> declarations) {
        this.declarations = declarations;
    }
}
