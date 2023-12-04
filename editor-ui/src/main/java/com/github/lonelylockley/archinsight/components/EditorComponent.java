package com.github.lonelylockley.archinsight.components;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.github.lonelylockley.archinsight.security.Authentication;
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

    private final SwitchListenerHelper switchListener;

    public EditorComponent(SwitchListenerHelper switchListener) {
        this.switchListener = switchListener;
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        setId("editor");
        if (Authentication.playgroundModeEnabled()) {
            UI.getCurrent().getPage().executeJs("initializeEditor($0, $1)", "org.archinsight.playground.sourcecode", null);
        }
        else {
            UI.getCurrent().getPage().executeJs("initializeEditor($0, $1)", "org.archinsight.editor.sourcecode", null);
        }
    }

    private int nonNull(Integer value) {
        return value == null ? 0 : value;
    }

    @ClientCallable
    public void render(String code) {
        try {
            var file = switchListener.getOpenedFileId();
            var repo = switchListener.getActiveRepositoryId();
            var messages = remoteSource.render.render(code, repo, file);
            var msg = new StringBuilder();
            for (Map.Entry<UUID, List<TranslatorMessage>> entry : messages.entrySet()) {
                if (Objects.equals(file, entry.getKey())) {
                    ObjectWriter ow = new ObjectMapper().writer().withDefaultPrettyPrinter();
                    getElement().executeJs("window.editor.addModelMarkers($0)", ow.writeValueAsString(messages.get(file)));
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

    private boolean canAutoSaveFile(CloseReason reason) {
        return !Authentication.playgroundModeEnabled() && switchListener.repositoryOpened()
                && switchListener.fileOpened() && reason != CloseReason.DELETED;
    }

    public boolean closeFile(CloseReason reason) {
        if (canAutoSaveFile(reason)) {
            saveCode();
        }
        if (switchListener.fileOpened()) {
            getElement().executeJs("window.editor.setValue('')");
            return true;
        }
        else {
            return false;
        }
    }

    public void saveCode() {
        if (switchListener.fileOpened()) {
            // capture context, because lambdas will be called asynchronously when fileOpened will be already updated
            final var filename = switchListener.getOpenedFile().getName();
            final var id = switchListener.getOpenedFileId();
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
