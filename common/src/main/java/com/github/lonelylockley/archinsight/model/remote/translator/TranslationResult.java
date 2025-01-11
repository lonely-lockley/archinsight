package com.github.lonelylockley.archinsight.model.remote.translator;

import java.util.Collections;
import java.util.List;
import java.util.Set;

public class TranslationResult extends TranslationRequest {

    private Set<TranslatorMessage> messages = Collections.emptySet();
    private List<Symbol> symbols = Collections.emptyList();
    private boolean hasErrors = false;
    private TabData edited;

    public Set<TranslatorMessage> getMessages() {
        return messages;
    }

    public void setMessages(Set<TranslatorMessage> messages) {
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

    public List<Symbol> getSymbols() {
        return symbols;
    }

    public void setSymbols(List<Symbol> symbols) {
        this.symbols = symbols;
    }
}
