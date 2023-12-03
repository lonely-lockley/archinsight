package com.github.lonelylockley.archinsight.components;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.repository.RepostioryInfo;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.google.common.eventbus.Subscribe;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.dependency.NpmPackage;
import com.vaadin.flow.component.html.Div;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

@NpmPackage(value = "monaco-editor-core", version = "^0.40.0")
@NpmPackage(value = "monaco-editor", version = "^0.40.0")
@NpmPackage(value = "linked-list-typescript", version = "^1.0.15")
@NpmPackage(value = "antlr4ts", version = "^0.5.0-alpha.4")
@NpmPackage(value = "antlr4ts-cli", version = "^0.5.0-alpha.4")
@JsModule("./src/EditorInitializer.ts")
public class EditorComponent extends Div {

    private static final Logger logger = LoggerFactory.getLogger(EditorComponent.class);

    private final RemoteSource remoteSource;

    private RepositoryNode fileOpened;
    private RepostioryInfo repositorySelected;

    public EditorComponent() {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        setId("editor");
        if (Authentication.playgroundModeEnabled()) {
            UI.getCurrent().getPage().executeJs("initializeEditor($0, $1)", "org.archinsight.playground.sourcecode", null);
        }
        else {
            UI.getCurrent().getPage().executeJs("initializeEditor($0, $1)", "org.archinsight.editor.sourcecode", null);
        }

        final var fileSelectionListener = new BaseListener<FileOpenRequestEvent>() {
            @Override
            @Subscribe
            public void receive(FileOpenRequestEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                fileOpened = e.getFile();
            }
            }
        };
        Communication.getBus().register(fileSelectionListener);
        addDetachListener(e -> Communication.getBus().unregister(fileSelectionListener));

        final var repositorySelectionListener = new BaseListener<RepositorySelectionEvent>() {
            @Override
            @Subscribe
            public void receive(RepositorySelectionEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                repositorySelected = e.getNewValue();
            }
            }
        };
        Communication.getBus().register(repositorySelectionListener);
        addDetachListener(e -> { Communication.getBus().unregister(repositorySelectionListener); });

        final var repositoryCloseListener = new BaseListener<RepositoryCloseEvent>() {
            @Override
            @Subscribe
            public void receive(RepositoryCloseEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                if (!Authentication.playgroundModeEnabled()) {
                    saveCode();
                }
                repositorySelected = null;
                fileOpened = null;
            }
            }
        };
        Communication.getBus().register(repositoryCloseListener);
        addDetachListener(e -> { Communication.getBus().unregister(repositoryCloseListener); });

        final var fileRestorationListener = new BaseListener<FileRestoredEvent>() {
            @Override
            @Subscribe
            public void receive(FileRestoredEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                fileOpened = e.getOpenedFile();
            }
            }
        };
        Communication.getBus().register(fileRestorationListener);
        addDetachListener(e -> { Communication.getBus().unregister(fileRestorationListener); });

        final var fileCloseListener = new BaseListener<FileCloseRequestEvent>() {
            @Override
            @Subscribe
            public void receive(FileCloseRequestEvent e) {
            if (eventWasProducedForCurrentUiId(e)) {
                if (!Authentication.playgroundModeEnabled()) {
                    saveCode();
                }
                fileOpened = null;
            }
            }
        };
        Communication.getBus().register(fileCloseListener);
        addDetachListener(e -> { Communication.getBus().unregister(fileCloseListener); });
    }

    private int nonNull(Integer value) {
        return value == null ? 0 : value;
    }

    @ClientCallable
    public void render(String code) {
        try {
            var file = fileOpened == null ? null : fileOpened.getId();
            var repo = repositorySelected == null ? null : repositorySelected.getId();
            var messages = remoteSource.render.render(code, repo, file);
            var msg = new StringBuilder();
            for (Map.Entry<UUID, List<TranslatorMessage>> entry : messages.entrySet()) {
                if (Objects.equals(file, entry.getKey())) {
                    ObjectWriter ow = new ObjectMapper().writer().withDefaultPrettyPrinter();
                    getElement().executeJs("window.editor.addModelMarkers($0)", ow.writeValueAsString(messages.get(fileOpened.getId())));
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
            Communication.getBus().post(new SourceCompilationEvent(false));
            new NotificationComponent(ex.getMessage(), MessageLevel.ERROR, 5000);
            logger.error("Could not render source", ex);
        }
    }

    public void reset() {
        getElement().executeJs("window.editor.setValue('')");
    }

    public void saveCode() {
        if (fileOpened != null) {
            // capture context, because lambdas will be called asynchronously when fileOpened will be already updated
            final var filename = fileOpened.getName();
            final var id = fileOpened.getId();
            getElement().executeJs("return window.editor.getValue()").then(String.class,
                    code -> {
                        remoteSource.repository.saveFile(id, code);
                        // this messages seems to be annoying. may be uncommented any time later
                        //Communication.getBus().post(new NotificationEvent(MessageLevel.WARNING, String.format("File %s saved", filename), 3000));
                    },
                    error -> {
                        Communication.getBus().post(new NotificationEvent(MessageLevel.ERROR, String.format("Could not save file %s", filename), 3000));
                    }
            );
        }
    }

}
