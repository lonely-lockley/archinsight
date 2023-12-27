package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;

public class WorkAreaComponent extends VerticalLayout {

    private final SwitchListenerHelper switchListener;
    private final MenuBarComponent menu;

    public WorkAreaComponent(Div invisible, boolean readOnly) {
        switchListener = new SwitchListenerHelper(this);
        menu = new MenuBarComponent(invisible, readOnly, switchListener);
        final var tabs = new TabsComponent(switchListener);
        add(tabs);
        setSpacing(false);
        setPadding(false);
        setSizeFull();
        switchListener.setRepositoryCloseCallback(e -> {
            tabs.closeAllTabs(e.getReason());
            menu.disableSaveButton();
            menu.disableExportButton();
            menu.disableControlButtons();
        });
//        switchListener.setFileCloseCallback(e -> {
//            var closed = editor.closeFile(e.getReason());
//            if (closed) {
//                view.reset();
//                menu.disableExportButton();
//                menu.disableControlButtons();
//            }
//        });
        switchListener.setFileSelectionCallback(e -> {
            tabs.openTab(switchListener.getActiveRepositoryId(), e.getFile());
        });
        switchListener.setRepositorySelectionCallback(e -> {
            menu.enableSaveButton();
        });
        switchListener.setFileRestorationCallback(e -> {
            menu.enableSaveButton();
            tabs.openTab(switchListener.getActiveRepositoryId(), e.getOpenedFile());
        });
    }

    public MenuBarComponent getMenuControls() {
        return menu;
    }
}
