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

    protected void initView(String titleSuffix, boolean readOnly, int menuMargin) {
        registerNotificationListener();
        Communication.getBus().post(new RepositoryCloseEvent(FileChangeReason.CLOSED));

        /* =============================================================================================================
         * a hidden element to spawn download links
         * without it, download activation script triggering anchor click, triggers menu item click again causing
         * endless cycle
         */
        final var invisible = new Div();
        invisible.getElement().getStyle().set("display", "none");
        addToDrawer(invisible);
        // =============================================================================================================

        final var content = new WorkAreaComponent(invisible, readOnly);
        final var menu = content.getMenuControls();
        menu.getStyle().set("margin-left", menuMargin + "px");
        final var title = createTitle(titleSuffix, menu);

        final var toggle = new DrawerToggle();
        toggle.addClickListener(e -> {
            if (isDrawerOpened()) {
                menu.getStyle().set("margin-left", menuMargin + "px");
            }
            else {
                menu.getStyle().set("margin-left", "20px");
            }
        });

        // create content first to register all event listeners
        final var contentLayout = new VerticalLayout();
        contentLayout.setSpacing(false);
        contentLayout.setPadding(false);
        contentLayout.add(content);
        contentLayout.setSizeFull();
        setContent(contentLayout);

        // and repository component second because it sends openRepository event
        final var nav = new NavigationPanelComponent(readOnly);
        addToDrawer(nav);
        addToNavbar(toggle, title, new UserMenuComponent());
        setDrawerOpened(true);

        setupFrontend(getElement());
    }

    private void registerNotificationListener() {
        // Common notification controller
        Communication.getBus().register(this,
                new BaseListener<NotificationEvent>() {
                    @Override
                    @Subscribe
                    public void receive(NotificationEvent e) {
                        e.getUIContext().access(() -> {
                            new NotificationComponent(e.getMessage(), e.getLevel(), e.getDuration());
                        });
                    }
                });
    }

}