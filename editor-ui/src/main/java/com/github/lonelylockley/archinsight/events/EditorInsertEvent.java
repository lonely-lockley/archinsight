package com.github.lonelylockley.archinsight.events;

public class EditorInsertEvent extends BaseEvent {

    private final String codeToInsert;

    public EditorInsertEvent(String codeToInsert) {
        this.codeToInsert = codeToInsert;
    }

    public String getCodeToInsert() {
        return codeToInsert;
    }
}
