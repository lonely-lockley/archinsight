package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.events.Communication;
import com.github.lonelylockley.archinsight.events.SvgDataEvent;
import com.github.lonelylockley.archinsight.model.MessageLevel;
import com.github.lonelylockley.archinsight.model.TranslatedSource;
import com.github.lonelylockley.archinsight.remote.RenderSource;
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

    private final RenderSource rs = new RenderSource();

    public EditorComponent() {
        setId("editor");
        UI.getCurrent().getPage().executeJs("initializeEditor($0)", "");
    }
    @ClientCallable
    public void render(String code) {
        TranslatedSource res = null;
        try {
            res = rs.render(code);
            if (res.getMessages() == null || res.getMessages().isEmpty()) {
//                ObjectWriter ow = new ObjectMapper().writer().withDefaultPrettyPrinter();
//                return ow.writeValueAsString(res);
                Communication.getBus().post(new SvgDataEvent(res.source));
            }
            else {
                res.getMessages().forEach(e -> { new ErrorNotificationComponent(e.getMsg(), MessageLevel.ERROR); });
            }
        }
        catch (Exception ex) {
            new ErrorNotificationComponent(ex.getMessage(), MessageLevel.ERROR);
            logger.error("Could not render object. Sending empty response to browser", ex);
        }
    }



}
