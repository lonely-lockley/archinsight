package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.components.EditorTabComponent;
import org.apache.commons.lang3.function.TriConsumer;

import java.util.Collection;

public class DoWithSourceEvent extends BaseEvent {

    /**
     * tabId, file, source
     */
    private final TriConsumer<EditorTabComponent, String, Collection<EditorTabComponent>> callback;

    public DoWithSourceEvent(TriConsumer<EditorTabComponent, String, Collection<EditorTabComponent>> callback) {
        this.callback = callback;
    }

    public TriConsumer<EditorTabComponent, String, Collection<EditorTabComponent>> getCallback() {
        return callback;
    }
}
