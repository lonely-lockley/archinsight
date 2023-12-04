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

    public WorkAreaComponent(Div invisible, boolean readOnly) {
        switchListener = new SwitchListenerHelper(this);
        final var editor = new EditorComponent(switchListener);
        final var view = new SVGViewComponent();
        final var splitPane = new SplitViewComponent(editor, view);
        final var menu = new MenuBarComponent(invisible, readOnly, switchListener);
        var menuBar = new HorizontalLayout();
        setSizeFull();
        menuBar.add(menu);
        if (Authentication.playgroundModeEnabled() && !Authentication.authenticated()) {
            menuBar.add(new CreateRepositoryComponent());
        }
        add(menuBar);
        add(splitPane);
        switchListener.setRepositoryCloseCallback(e -> {
            menu.disableExportButton();
            menu.disableControlButtons();
            editor.closeFile(e.getReason());
            view.reset();
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

}
