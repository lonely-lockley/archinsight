package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class SourceCompilationEvent extends BaseEvent {
    private final String tabId;
    private final boolean success;
    private final Map<UUID, List<TranslatorMessage>> messagesByFile = new HashMap<>();

    public SourceCompilationEvent(String tabId, boolean success) {
        this.tabId = tabId;
        this.success = success;
    }

    public SourceCompilationEvent(String tabId, boolean success, Map<UUID, List<TranslatorMessage>> messagesByFile) {
        this.tabId = tabId;
        this.success = success;
        this.messagesByFile.putAll(messagesByFile);
    }

    public Map<UUID, List<TranslatorMessage>> getMessagesByFile() {
        return messagesByFile;
    }

    public String getTabId() {
        return tabId;
    }

    public boolean success() {
        return success;
    }

    public boolean failure() {
        return !success;
    }
}
