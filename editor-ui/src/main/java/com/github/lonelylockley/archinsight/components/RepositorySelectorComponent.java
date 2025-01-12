package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.dialogs.RepositoryManagementDialog;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryInfo;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.google.common.base.Strings;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;

import java.util.List;
import java.util.UUID;

public class RepositorySelectorComponent extends VerticalLayout {

    private final RemoteSource remoteSource;

    private RepositoryInfo selected = null;

    public RepositorySelectorComponent() {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        setWidth("100%");
        setPadding(false);
        setSpacing(false);

        var items = listRepositories();
        if (Authentication.playgroundModeEnabled()) {
            if (Authentication.authenticated()) {
                add(initRepositorySelector(true, items));
            }
            else {
                add(new CreateRepositoryComponent());
            }
        }
        else {
            add(initRepositorySelector(false, items));
        }
    }

    private List<RepositoryInfo> listRepositories() {
        var items = remoteSource.repository.listUserRepositories();
        if (items.size() == 1) {
            var item = items.iterator().next();
            // this event is sent before a listener is added, so it won't cause cycle
            Communication.getBus().post(new RepositorySelectionEvent(null, item));
        }
        else
        if (items.size() > 1) {
            restoreSelectedRepository(items);
        }
        return items;
    }

    private Button initRepositorySelector(boolean lockedOut, List<RepositoryInfo> items) {
        final var manageRepositoryButton = new Button("<Choose Repository>");
        manageRepositoryButton.getStyle()
                .setHeight("40px")
                .setMarginTop("5px")
                .setWidth("94%")
                .setMarginLeft("3%")
                .setMarginBottom("10px")
                .setColor("var(--lumo-body-text-color)");
        manageRepositoryButton.addThemeVariants(ButtonVariant.LUMO_PRIMARY);
        if (items.size() == 1) {
            var item = items.iterator().next();
            manageRepositoryButton.setText(String.format("[ %s ]", item.getName()));
        }
        else {
            manageRepositoryButton.setText("<Create Repository>");
        }

        if (!lockedOut) {
            manageRepositoryButton.addClickListener(event -> {
                var dlg = new RepositoryManagementDialog(selected);
                dlg.open();
            });
        }
        else {
            manageRepositoryButton.setEnabled(false);
        }

        Communication.getBus().register(this,
                new BaseListener<RepositoryCloseEvent>() {
                    @Override
                    @Subscribe
                    public void receive(RepositoryCloseEvent e) {
                        e.getUIContext().access(() -> {
                            manageRepositoryButton.setText("<Choose Repository>");
                            RepositorySelectorComponent.this.selected = null;
                            storeSelectedRepository(null);
                        });
                    }
                },

                new BaseListener<RepositorySelectionEvent>() {
                    @Override
                    @Subscribe
                    public void receive(RepositorySelectionEvent e) {
                        e.getUIContext().access(() -> {
                            manageRepositoryButton.setText(String.format("[ %s ]", e.getNewValue().getName()));
                            RepositorySelectorComponent.this.selected = e.getNewValue();
                            storeSelectedRepository(e.getNewValue().getId());
                        });
                    }
                });

        return manageRepositoryButton;
    }

    private void storeSelectedRepository(UUID repositoryId) {
       getElement().executeJs("localStorage.setItem($0, $1)", "org.archinsight.editor.project", repositoryId == null ? "" : repositoryId.toString());
    }

    private void restoreSelectedRepository(List<RepositoryInfo> items) {
        getElement().executeJs("return localStorage.getItem($0)", "org.archinsight.editor.project").then(String.class, repositoryId -> {
            if (!Strings.isNullOrEmpty(repositoryId)) {
                var uuid = UUID.fromString(repositoryId);
                items.stream().filter(repo -> repo.getId().equals(uuid)).forEach(repo -> {
                    Communication.getBus().post(new RepositorySelectionEvent(RepositorySelectorComponent.this.selected, repo));
                    RepositorySelectorComponent.this.selected = repo;
                });
            }
        });
    }

}
