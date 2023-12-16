package com.github.lonelylockley.archinsight.screens;

import com.github.lonelylockley.archinsight.components.*;
import com.github.lonelylockley.archinsight.events.*;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.applayout.AppLayout;
import com.vaadin.flow.component.applayout.DrawerToggle;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;

/**
 * The main view contains a button and a click listener.
 */
public abstract class BasicEditorView extends AppLayout implements BaseView {

    protected void initView(String titleSuffix, boolean readOnly) {
        registerNotificationListener();
        Communication.getBus().post(new RepositoryCloseEvent(CloseReason.CLOSED));
        DrawerToggle toggle = new DrawerToggle();

        /* =============================================================================================================
         * a hidden element to spawn download links
         * without it, download activation script triggering anchor click, triggers menu item click again causing
         * endless cycle
         */
        var invisible = new Div();
        invisible.getElement().getStyle().set("display", "none");
        addToDrawer(invisible);
        // =============================================================================================================

        var content = new WorkAreaComponent(invisible, readOnly);
        var title = createTitle(titleSuffix, content.getMenuControls());

        // create content first to register all event listeners
        var contentLayout = new VerticalLayout();
        contentLayout.setSpacing(false);
        contentLayout.setPadding(false);
        contentLayout.add(content);
        contentLayout.setSizeFull();
        setContent(contentLayout);

        // and repository component second because it sends event
        var nav = new RepositoryComponent(readOnly);
        addToDrawer(nav);
        addToNavbar(toggle, title, new UserMenuComponent());
        setDrawerOpened(true);

        applyDarkTheme(getElement());
    }

    private void registerNotificationListener() {
        // Common notification controller
        final var notificationListener = new BaseListener<NotificationEvent>() {
            @Override
            @Subscribe
            public void receive(NotificationEvent e) {
                if (eventWasProducedForCurrentUiId(e)) {
                    new NotificationComponent(e.getMessage(), e.getLevel(), e.getDuration());
                }
            }
        };
        Communication.getBus().register(notificationListener);
        addDetachListener(e -> {
            Communication.getBus().unregister(notificationListener);
        });
    }

}