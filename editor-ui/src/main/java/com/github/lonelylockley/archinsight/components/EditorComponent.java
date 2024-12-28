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

import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

@NpmPackage(value = "monaco-editor", version = "^0.40.0")
@NpmPackage(value = "antlr4ng", version = "3.0.5")
@NpmPackage(value = "antlr4ng-cli", version = "2.0.0")
@NpmPackage(value = "antlr4-c3", version = "3.4.1")
@JsModule("./src/EditorInitializer.ts")
public class EditorComponent extends Div {

    private static final Logger logger = LoggerFactory.getLogger(EditorComponent.class);

    private final RemoteSource remoteSource;
    private final BiConsumer<String, Boolean> renderer;
    private final String id;

    private String originalHash;
    private String clientHash;
    private String clientCodeCache;

    private boolean hasErrors = false;

    public EditorComponent(String rootId, String tabId, BiConsumer<String, Boolean> renderer, String content) {
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

    public void doWithCode(EditorTabComponent tab, Collection<EditorTabComponent> tabs, TriConsumer<EditorTabComponent, String, Collection<EditorTabComponent>> andThen) {
        getElement().executeJs("return this.editor.getValue()").then(String.class,
                code -> {
                    andThen.accept(tab, code, tabs);
                },
                errorMsg -> {
                    logger.error(errorMsg);
                    andThen.accept(tab, clientCodeCache, tabs);
                }
        );
    }

    public String getCachedClientCode() {
        return clientCodeCache;
    }

    public boolean hasErrors() {
        return hasErrors;
    }

    public void setModelMarkers(List<TranslatorMessage> messages) {
        hasErrors = true;
        ObjectWriter ow = new ObjectMapper().writer();
        try {
            getElement().executeJs("this.editor.setModelMarkers($0)", ow.writeValueAsString(messages));
        }
        catch (JsonProcessingException ex) {
            throw new RuntimeException("Could not serialize value as JSON", ex);
        }
    }

    public void resetModelMarkers() {
        hasErrors = false;
        getElement().executeJs("this.editor.resetModelMarkers()");
    }

    public void render(String tabId, String digest, String code, boolean darkMode) {
        hasErrors = false;
        if (digest != null) {
            clientHash = digest;
        }
        clientCodeCache = code;
        renderer.accept(tabId, darkMode);
    }

    public void cache(String tabId, String digest, String code) {
        hasErrors = true;
        Communication.getBus().post(new SourceCompilationEvent(tabId, false));
        clientHash = digest;
        clientCodeCache = code;
    }

    public void putCursorInPosition(int line, int column) {
        getElement().executeJs("this.editor.setPosition({column: $0, lineNumber: $1})", column, line);
        getElement().executeJs("this.editor.revealLineInCenter($0)", line);
    }

}
