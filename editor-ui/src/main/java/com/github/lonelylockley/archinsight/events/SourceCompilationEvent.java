package com.github.lonelylockley.archinsight.events;

public class SourceCompilationEvent {
    private final boolean success;

    public SourceCompilationEvent(boolean success) {
        this.success = success;
    }

    public boolean success() {
        return success;
    }

    public boolean failure() {
        return !success;
    }
}
