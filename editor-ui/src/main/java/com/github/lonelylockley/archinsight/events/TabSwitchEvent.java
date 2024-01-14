package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.components.EditorTabComponent;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;

public class TabSwitchEvent extends BaseEvent {
    private final EditorTabComponent previousTab;
    private final EditorTabComponent selectedTab;

    public TabSwitchEvent(EditorTabComponent previousTab, EditorTabComponent selectedTab) {
        this.previousTab = previousTab;
        this.selectedTab = selectedTab;
    }

    public EditorTabComponent getPreviousTab() {
        return previousTab;
    }

    public EditorTabComponent getSelectedTab() {
        return selectedTab;
    }

    public RepositoryNode getSelectedFile() {
        return selectedTab == null ? null : selectedTab.getFile();
    }
}
