package com.github.lonelylockley.archinsight.model.remote.translator;

public enum MessageLevel {
    NOTICE(0),
    WARNING(1),
    ERROR(2);

    private final int priority;

    MessageLevel(int priority) {
        this.priority = priority;
    }

    public int getPriority() {
        return priority;
    }
}
