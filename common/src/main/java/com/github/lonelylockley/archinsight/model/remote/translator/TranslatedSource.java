package com.github.lonelylockley.archinsight.model.remote.translator;

import java.util.List;

public class TranslatedSource extends Source {

    private List<LinkerMessage> messages;

    public List<LinkerMessage> getMessages() {
        return messages;
    }

    public void setMessages(List<LinkerMessage> messages) {
        this.messages = messages;
    }
}
