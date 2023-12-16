package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;

public class WorkAreaComponent extends VerticalLayout {

    private final SwitchListenerHelper switchListener;
    private final MenuBarComponent menu;

    public WorkAreaComponent(Div invisible, boolean readOnly) {
        switchListener = new SwitchListenerHelper(this);
        menu = new MenuBarComponent(invisible, readOnly, switchListener);
        final var editor = new EditorComponent(switchListener);
        final var view = new SVGViewComponent();
        final var splitPane = new SplitViewComponent(editor, view);
        add(splitPane);
        setSpacing(false);
        setSizeFull();
        switchListener.setRepositoryCloseCallback(e -> {
            var closed = editor.closeFile(e.getReason());
            if (closed) {
                view.reset();
                menu.disableSaveButton();
                menu.disableExportButton();
                menu.disableControlButtons();
            }
        });
        switchListener.setFileCloseCallback(e -> {
            var closed = editor.closeFile(e.getReason());
            if (closed) {
                view.reset();
                menu.disableExportButton();
                menu.disableControlButtons();
            }
        });
        switchListener.setFileSelectionCallback(e -> {
            menu.openFile(e.getFile());
        });
        switchListener.setRepositorySelectionCallback(e -> {
            menu.enableSaveButton();
        });
        switchListener.setFileRestorationCallback(e -> {
            menu.enableSaveButton();
        });
    }

    public MenuBarComponent getMenuControls() {
        return menu;
    }
}
