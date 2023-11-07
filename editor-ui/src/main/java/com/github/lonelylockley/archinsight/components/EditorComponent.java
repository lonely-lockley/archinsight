package com.github.lonelylockley.archinsight.components;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import com.github.lonelylockley.archinsight.MicronautContext;
import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.SourceCompilationEvent;
import com.github.lonelylockley.archinsight.events.SvgDataEvent;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatedSource;
import com.github.lonelylockley.archinsight.remote.RemoteSource;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.dependency.NpmPackage;
import com.vaadin.flow.component.html.Div;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@NpmPackage(value = "monaco-editor-core", version = "^0.40.0")
@NpmPackage(value = "monaco-editor", version = "^0.40.0")
@NpmPackage(value = "linked-list-typescript", version = "^1.0.15")
@NpmPackage(value = "antlr4ts", version = "^0.5.0-alpha.4")
@NpmPackage(value = "antlr4ts-cli", version = "^0.5.0-alpha.4")
@JsModule("./src/EditorInitializer.ts")
public class EditorComponent extends Div {

    private static final Logger logger = LoggerFactory.getLogger(EditorComponent.class);

    private final RemoteSource remoteSource;

    public EditorComponent() {
        this.remoteSource = MicronautContext.getInstance().getRemoteSource();
        setId("editor");
        if (Authentication.playgroundModeEnabled()) {
            UI.getCurrent().getPage().executeJs("initializeEditor($0, $1)", "org.archinsight.playground.sourcecode", null);
        }
        else {
            UI.getCurrent().getPage().executeJs("initializeEditor($0, $1)", "org.archinsight.editor.sourcecode", null);
        }
    }
    @ClientCallable
    public void render(String code) {
        TranslatedSource res = null;
        try {
            res = remoteSource.render.render(code);
            if (res.getMessages() == null || res.getMessages().isEmpty()) {
                Communication.getBus().post(new SourceCompilationEvent(true));
                Communication.getBus().post(new SvgDataEvent(res.getSource()));
            }
            else {
                Communication.getBus().post(new SourceCompilationEvent(false));
                ObjectWriter ow = new ObjectMapper().writer().withDefaultPrettyPrinter();
                getElement().executeJs("window.editor.addModelMarkers($0)", ow.writeValueAsString(res.getMessages()));
            }
        }
        catch (Exception ex) {
            Communication.getBus().post(new SourceCompilationEvent(false));
            new NotificationComponent(ex.getMessage(), MessageLevel.ERROR, 3000);
            logger.error("Could not render object. Sending empty response to browser", ex);
        }
    }

    public void reset() {
        getElement().executeJs("window.editor.setValue('')");
    }

}
