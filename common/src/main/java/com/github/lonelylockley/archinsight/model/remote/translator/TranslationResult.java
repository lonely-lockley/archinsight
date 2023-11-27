package com.github.lonelylockley.archinsight.model.remote.translator;

import java.util.List;

public class TranslationResult extends TranslationRequest {

    private List<TranslatorMessage> messages;

    public List<TranslatorMessage> getMessages() {
        return messages;
    }

    public void setMessages(List<TranslatorMessage> messages) {
        this.messages = messages;
    }

}
