package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.events.*;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;

import java.util.Optional;

public class WorkAreaComponent extends VerticalLayout {

    private final SwitchListenerHelper switchListener;
    private final MenuBarComponent menu;

    public WorkAreaComponent(Div invisible, boolean readOnly) {
        switchListener = new SwitchListenerHelper(this);
        menu = new MenuBarComponent(invisible, readOnly, switchListener);
        final var tabs = new TabsComponent();
        hideComponent(tabs);
        final var welcome = new WelcomePanelComponent(switchListener);
        add(tabs);
        add(welcome);
        setSpacing(false);
        setPadding(false);
        setSizeFull();
        switchListener.setRepositoryCloseCallback(e -> {
            welcome.switchToNoRepo();
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
            hideComponent(welcome);
            showComponent(tabs);
            tabs.openTab(switchListener.getActiveRepositoryId(), e.getFile(), e.getSource());
            menu.enableSourceBlock();
        });
        switchListener.setRepositorySelectionCallback(e -> {
            welcome.switchToRepo();
            menu.enableNewFile();
        });
        switchListener.setTabSwitchCallback(e -> {
            if (e.getSelectedTab() == null) {
                menu.disableDiagramBlock();
                menu.disableExportBlock();
                menu.disableSourceBlock();
                showComponent(welcome);
                hideComponent(tabs);
            }
            else {
                if (e.getSelectedTab().getView().hasImage()) {
                    menu.enableDiagramBlock();
                }
                else {
                    menu.disableDiagramBlock();
                }

                if (e.getSelectedTab().getHasErrorsOrEmpty()) {
                    menu.disableExportBlock();
                }
                else {
                    menu.enableExportBlock();
                }
            }
        });
        final var sourceCompilationListener = new BaseListener<SourceCompilationEvent>() {
            @Override
            @Subscribe
            public void receive(SourceCompilationEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                Optional.ofNullable(tabs.getSelectedTab()).ifPresent(tab -> {
                    if (tab.getHasErrorsOrEmpty()) {
                        menu.disableExportBlock();
                    }
                    else {
                        menu.enableExportBlock();
                    }
                });

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

    /*
     * Visibility affects component state and stops listening to events. Use CSS instead
     */
    private void hideComponent(Component comp) {
        comp.getElement().getStyle().set("display", "none");
    }

    private void showComponent(Component comp) {
        comp.getElement().getStyle().remove("display");
    }
}
