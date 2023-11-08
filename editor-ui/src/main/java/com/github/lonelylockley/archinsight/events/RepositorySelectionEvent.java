package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.repository.RepostioryInfo;

public class RepositorySelectionEvent extends BaseEvent {

    private final RepostioryInfo oldValue;
    private final RepostioryInfo newValue;

    public RepositorySelectionEvent(RepostioryInfo oldValue, RepostioryInfo newValue) {
        this.oldValue = oldValue;
        this.newValue = newValue;
    }

    public RepostioryInfo getOldValue() {
        return oldValue;
    }

    public RepostioryInfo getNewValue() {
        return newValue;
    }
}
