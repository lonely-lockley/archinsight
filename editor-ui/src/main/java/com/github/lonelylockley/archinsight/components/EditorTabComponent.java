package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.FileChangeReason;
import com.github.lonelylockley.archinsight.events.SourceCompilationEvent;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.tabs.Tab;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.stream.Collectors;

public class EditorTabComponent extends Tab {

    private static final Logger logger = LoggerFactory.getLogger(EditorTabComponent.class);

    private final Span label;
    private final RemoteSource remoteSource;
    private final EditorComponent editor;
    private final SVGViewComponent view;
    private final SplitViewComponent content;
    private final String id;
    private final UUID repositoryId;

    private BiConsumer<EditorTabComponent, FileChangeReason> listener;
    private RepositoryNode file;

    public EditorTabComponent(String parentId, UUID repositoryId, RepositoryNode file) {
        super();
        this.label = new Span(file.getName());
        add(label);
        this.file = file;
        this.repositoryId = repositoryId;
        this.id = String.format("editor-tab-%s", UUID.randomUUID());
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        String source = "";
        if (!file.isNew()) {
            source = remoteSource.repository.openFile(file.getId());
        }
        this.editor = new EditorComponent(parentId, id, this::renderer, source);
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

    public void renderer(String code) {
        try {
            logger.warn(">>>>> render for tab " + id);
            var messages = remoteSource.render.render(code, id, repositoryId, file.getId());
            var msg = new StringBuilder();
            for (Map.Entry<UUID, List<TranslatorMessage>> entry : messages.entrySet()) {
                if (Objects.equals(file.getId(), entry.getKey())) {
                    editor.addModelMarkers(messages.get(file.getId()));
                }
                else {
                    var location = entry.getValue().stream().findFirst().get().getLocation();
                    var summary = entry.getValue().stream().collect(Collectors.toMap(TranslatorMessage::getLevel, val -> 1, Integer::sum));
                    msg
                            .append('\n')
                            .append("- In file ")
                            .append(location)
                            .append('\n')
                            .append("errors: ")
                            .append(nonNull(summary.get(MessageLevel.ERROR)))
                            .append(" warnings: ")
                            .append(nonNull(summary.get(MessageLevel.WARNING)))
                            .append(" notices: ")
                            .append(nonNull(summary.get(MessageLevel.NOTICE)));
                }
            }
            if (!msg.isEmpty()) {
                new NotificationComponent("Project linking failure:" + msg, MessageLevel.ERROR, 15000);
            }
        }
        catch (Exception ex) {
            Communication.getBus().post(new SourceCompilationEvent(id, false));
            new NotificationComponent(ex.getMessage(), MessageLevel.ERROR, 5000);
            logger.error("Could not render source", ex);
        }
    }

    private int nonNull(Integer value) {
        return value == null ? 0 : value;
    }

}
