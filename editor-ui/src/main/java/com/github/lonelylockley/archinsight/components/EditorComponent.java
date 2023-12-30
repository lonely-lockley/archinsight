package com.github.lonelylockley.archinsight.components;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.*;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.dependency.NpmPackage;
import com.vaadin.flow.component.html.Div;
import org.apache.commons.codec.digest.DigestUtils;
import org.apache.commons.lang3.function.TriConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Consumer;

@NpmPackage(value = "monaco-editor-core", version = "^0.40.0")
@NpmPackage(value = "monaco-editor", version = "^0.40.0")
@NpmPackage(value = "linked-list-typescript", version = "^1.0.15")
@NpmPackage(value = "antlr4ts", version = "^0.5.0-alpha.4")
@NpmPackage(value = "antlr4ts-cli", version = "^0.5.0-alpha.4")
@JsModule("./src/EditorInitializer.ts")
public class EditorComponent extends Div {

    private static final Logger logger = LoggerFactory.getLogger(EditorComponent.class);

    private final RemoteSource remoteSource;
    private final Consumer<String> renderer;
    private final String id;

    private String originalHash;
    private String clientHash;
    private String clientCodeCache;

    public EditorComponent(String rootId, String tabId, Consumer<String> renderer, String content) {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        this.renderer = renderer;
        this.clientCodeCache = content;
        this.originalHash = DigestUtils.sha256Hex(content);
        this.id = String.format("editor-%s", UUID.randomUUID());
        setId(id);
        UI.getCurrent().getPage().executeJs("initializeEditor($0, $1, $2, $3, $4)", id, rootId, tabId, getKey(), content);
    }

    private String getKey() {
        return Authentication.playgroundModeEnabled() ? "org.archinsight.playground.tabs" : "org.archinsight.editor.tabs";
    }

    private boolean canAutoSaveFile(RepositoryNode file, FileChangeReason reason) {
        return !Authentication.playgroundModeEnabled() && !file.isNew() && reason != FileChangeReason.DELETED;
    }

    public void close(RepositoryNode file, FileChangeReason reason, Consumer<String> andThen) {
        if (canAutoSaveFile(file, reason)) {
            saveCode(file, reason, andThen);
        }
        else {
            andThen.accept(clientCodeCache);
        }
    }

    public void saveCode(RepositoryNode file, FileChangeReason reason, Consumer<String> andThen) {
        // capture context, because lambdas will be called asynchronously when fileOpened will be already updated
        final var filename = file.getName();
        final var id = file.getId();
        getElement().executeJs("return this.editor.getValue()").then(String.class,
            code -> {
                clientHash = DigestUtils.sha256Hex(code);
                if (!Objects.equals(originalHash, clientHash)) {
                    remoteSource.repository.saveFile(id, code);
                    // this messages seems to be annoying. so default behavior is silent
                    if (reason == FileChangeReason.USER_REQUEST) {
                        Communication.getBus().post(new NotificationEvent(MessageLevel.WARNING, String.format("File %s saved", filename), 3000));
                    }
                    originalHash = clientHash;
                }
                andThen.accept(code);
            },
            error -> {
                logger.error(error);
                if (!Objects.equals(originalHash, clientHash)) {
                    remoteSource.repository.saveFile(id, clientCodeCache);
                    Communication.getBus().post(new NotificationEvent(MessageLevel.WARNING, String.format("File %s saved. Cached server version was saved - it may be out of sync with the browser", filename), 3000));
                }
                andThen.accept(clientCodeCache);
            }
        );
    }

    public void doWithCode(RepositoryNode file, String tabId, TriConsumer<String, RepositoryNode, String> andThen) {
        getElement().executeJs("return this.editor.getValue()").then(String.class,
                code -> {
                    andThen.accept(tabId, file, code);
                },
                error -> {
                    logger.error(error);
                    andThen.accept(tabId, file, clientCodeCache);
                }
        );
    }

    public void addModelMarkers(List<TranslatorMessage> messages) throws JsonProcessingException {
        ObjectWriter ow = new ObjectMapper().writer().withDefaultPrettyPrinter();
        getElement().executeJs("this.editor.addModelMarkers($0)", ow.writeValueAsString(messages));
    }

    public void render(String digest, String code) {
        cache(digest, code);
        renderer.accept(code);
    }

    public void cache(String digest, String code) {
        clientHash = digest;
        clientCodeCache = code;
    }

}
