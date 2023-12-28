package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.events.*;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;

public class WorkAreaComponent extends VerticalLayout {

    private final SwitchListenerHelper switchListener;
    private final MenuBarComponent menu;

    public WorkAreaComponent(Div invisible, boolean readOnly) {
        switchListener = new SwitchListenerHelper(this);
        menu = new MenuBarComponent(invisible, readOnly, switchListener);
        final var tabs = new TabsComponent();
        add(tabs);
        setSpacing(false);
        setPadding(false);
        setSizeFull();
        switchListener.setRepositoryCloseCallback(e -> {
            tabs.closeAllTabs(e.getReason());
            menu.disableDiagramBlock();
            menu.disableExportBlock();
            menu.disableSourceBlock();
            menu.disableNewFile();
        });
        switchListener.setFileCloseCallback(e -> {
            tabs.closeTab(e.getFile(), e.getReason());
        });
        switchListener.setFileSelectionCallback(e -> {
            tabs.openTab(switchListener.getActiveRepositoryId(), e.getFile());
            menu.enableSourceBlock();
        });
        switchListener.setRepositorySelectionCallback(e -> {
            menu.enableNewFile();
        });
        switchListener.setTabSwitchCallback(e -> {
            if (e.getSelectedTab() == null) {
                menu.disableDiagramBlock();
                menu.disableExportBlock();
                menu.disableSourceBlock();
            }
            else
            if (e.getSelectedTab().getEditor().hasErrors()) {
                menu.disableDiagramBlock();
                menu.disableExportBlock();
            }
            else {
                menu.enableExportBlock();
            }
        });
        final var sourceCompilationListener = new BaseListener<SourceCompilationEvent>() {
            @Override
            @Subscribe
            public void receive(SourceCompilationEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                if (e.failure()) {
                    menu.disableExportBlock();
                }
                else {
                    menu.enableExportBlock();
                }
            }
            }
        };
        Communication.getBus().register(sourceCompilationListener);

        final var svgDataListener = new BaseListener<SvgDataEvent>() {
            @Override
            @Subscribe
            public void receive(SvgDataEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                menu.enableDiagramBlock();
            }
            }
        };
        Communication.getBus().register(svgDataListener);

        addDetachListener(e -> {
            Communication.getBus().unregister(sourceCompilationListener);
            Communication.getBus().unregister(svgDataListener);
        });
    }

    public MenuBarComponent getMenuControls() {
        return menu;
    }
}
