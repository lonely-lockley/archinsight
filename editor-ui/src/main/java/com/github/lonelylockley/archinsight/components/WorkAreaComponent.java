package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.events.BaseListener;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.FileCloseRequestEvent;
import com.github.lonelylockley.archinsight.events.RepositoryCloseEvent;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;

public class WorkAreaComponent extends VerticalLayout {

    public WorkAreaComponent(Div invisible, boolean readOnly) {
        final var editor = new EditorComponent();
        final var view = new SVGViewComponent();
        final var splitPane = new SplitViewComponent(editor, view);
        var menu = new HorizontalLayout();
        setSizeFull();
        menu.add(new MenuBarComponent(invisible, readOnly));
        if (Authentication.playgroundModeEnabled() && !Authentication.authenticated()) {
            menu.add(new CreateRepositoryComponent());
        }
        add(menu);
        add(splitPane);

        final var repositoryCloseListener = new BaseListener<RepositoryCloseEvent>() {
            @Override
            @Subscribe
            public void receive(RepositoryCloseEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    editor.reset();
                    view.reset();
                }
            }
        };
        Communication.getBus().register(repositoryCloseListener);
        addDetachListener(e -> { Communication.getBus().unregister(repositoryCloseListener); });

        final var fileCloseListener = new BaseListener<FileCloseRequestEvent>() {
            @Override
            @Subscribe
            public void receive(FileCloseRequestEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    editor.reset();
                    view.reset();
                }
            }
        };
        Communication.getBus().register(fileCloseListener);
        addDetachListener(e -> { Communication.getBus().unregister(fileCloseListener); });
    }
}
