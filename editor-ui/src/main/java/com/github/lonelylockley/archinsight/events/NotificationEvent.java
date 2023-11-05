package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;

public class NotificationEvent extends BaseEvent {

    private final MessageLevel level;
    private final int durationMs;
    private final String message;

    public NotificationEvent(MessageLevel level, String message) {
        this.level = level;
        this.durationMs = 15000;
        this.message = message;
    }

    public NotificationEvent(MessageLevel level, String message, int durationMs) {
        this.level = level;
        this.durationMs = durationMs;
        this.message = message;
    }

    public MessageLevel getLevel() {
        return level;
    }

    public int getDuration() {
        return durationMs;
    }

    public String getMessage() {
        return message;
    }
}
