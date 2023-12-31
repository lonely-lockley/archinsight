package com.github.lonelylockley.archinsight.components;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.github.lonelylockley.archinsight.events.FileChangeReason;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.tabs.Tab;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

public class EditorTabComponent extends Tab {

    private static final Logger logger = LoggerFactory.getLogger(EditorTabComponent.class);

    private final Span label;
    private final EditorComponent editor;
    private final SVGViewComponent view;
    private final SplitViewComponent content;
    private final String id;
    private final UUID repositoryId;

    private BiConsumer<EditorTabComponent, FileChangeReason> listener;
    private RepositoryNode file;
    private boolean hasErrorsOrEmpty = false;

    public EditorTabComponent(String parentId, UUID repositoryId, RepositoryNode file, Optional<String> source, Consumer<String> renderer) {
        super();
        this.label = new Span(file.getName());
        add(label);
        this.file = file;
        this.repositoryId = repositoryId;
        this.id = String.format("editor-tab-%s", UUID.randomUUID());
        this.editor = new EditorComponent(parentId, id, renderer, source.orElse(""));
        this.view = new SVGViewComponent();
        this.content = new SplitViewComponent(editor, view);
        getStyle().set("padding-top", "0px").set("padding-bottom", "0px");
        var closeButton = new Button(VaadinIcon.CLOSE_SMALL.create());
        closeButton.addThemeVariants(ButtonVariant.LUMO_SMALL);
        closeButton.getStyle().set("padding", "0px");
        closeButton.getStyle().set("margin-left", "5px");
        closeButton.addThemeVariants(ButtonVariant.LUMO_TERTIARY, ButtonVariant.LUMO_ICON);
        closeButton.addClickListener(e -> {
            if (listener != null) {
                listener.accept(this, FileChangeReason.CLOSED);
            }
            // do not call it here. listener will call it from TabsComponent
            //closeTab(FileChangeReason.USER_REQUEST);
        });
        add(closeButton);
    }

    public void setCloseListener(BiConsumer<EditorTabComponent, FileChangeReason> listener) {
        this.listener = listener;
    }

    public void requestCloseTab(FileChangeReason reason, Consumer<String> andThen) {
        editor.close(file, reason, andThen);
    }

    public void saveSource() {
        editor.saveCode(file, FileChangeReason.USER_REQUEST, e -> {});
    }

    public SplitViewComponent getContent() {
        return content;
    }

    public EditorComponent getEditor() {
        return editor;
    }

    public SVGViewComponent getView() {
        return view;
    }

    public String getTabId() {
        return id;
    }

    public UUID getFileId() {
        return file.getId();
    }

    public RepositoryNode getFile() {
        return file;
    }

    public boolean isNew() {
        return file.isNew();
    }

    public void updateFile(RepositoryNode file) {
        this.file = file;
        label.setText(file.getName());
    }

    public void setHasErrorsOrEmpty() {
        hasErrorsOrEmpty = true;
    }

    public boolean getHasErrorsOrEmpty() {
        return hasErrorsOrEmpty;
    }

    public void addModelMarkers(List<TranslatorMessage> messages) throws JsonProcessingException {
        if (!messages.isEmpty()) {
            hasErrorsOrEmpty = true;
        }
        else {
            hasErrorsOrEmpty = false;
        }
        editor.addModelMarkers(messages);
    }

}
