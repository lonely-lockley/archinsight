package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;

import java.util.*;

public class SourceCompilationEvent extends BaseEvent {
    private final String tabId;
    private final boolean success;
    private final Map<String, List<TranslatorMessage>> messagesByTab;
    private final Set<UUID> filesWithErrors;

    public SourceCompilationEvent(String tabId, boolean success) {
        this.tabId = tabId;
        this.success = success;
        this.messagesByTab = new HashMap<>();
        this.filesWithErrors = new HashSet<>();
    }

    public SourceCompilationEvent(String tabId, boolean success, Map<String, List<TranslatorMessage>> messagesByTab, Set<UUID> filesWithErrors) {
        this.tabId = tabId;
        this.success = success;
        this.messagesByTab = new HashMap<>();
        this.messagesByTab.putAll(messagesByTab);
        this.filesWithErrors = filesWithErrors;
    }

    public Map<String, List<TranslatorMessage>> getMessagesByTab() {
        return messagesByTab;
    }

    public Set<UUID> getFilesWithErrors() {
        return filesWithErrors;
    }

    public boolean isSuccess() {
        return success;
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
