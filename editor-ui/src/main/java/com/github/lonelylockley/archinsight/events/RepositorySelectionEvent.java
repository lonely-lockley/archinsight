package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryInfo;

public class RepositorySelectionEvent extends BaseEvent {

    private final RepositoryInfo oldValue;
    private final RepositoryInfo newValue;

    public RepositorySelectionEvent(RepositoryInfo oldValue, RepositoryInfo newValue) {
        this.oldValue = oldValue;
        this.newValue = newValue;
    }

    public RepositoryInfo getOldValue() {
        return oldValue;
    }

    public RepositoryInfo getNewValue() {
        return newValue;
    }
}
