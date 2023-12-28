package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import org.apache.commons.lang3.function.TriConsumer;

public class DoWithSourceEvent extends BaseEvent {

    private final TriConsumer<String, RepositoryNode, String> callback;

    public DoWithSourceEvent(TriConsumer<String, RepositoryNode, String> callback) {
        this.callback = callback;
    }

    public TriConsumer<String, RepositoryNode, String> getCallback() {
        return callback;
    }
}
