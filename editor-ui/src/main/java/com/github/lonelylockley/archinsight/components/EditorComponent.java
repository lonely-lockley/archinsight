package com.github.lonelylockley.archinsight.components;

import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.dependency.NpmPackage;
import com.vaadin.flow.component.html.Div;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@NpmPackage(value = "monaco-editor-core", version = "^0.40.0")
@NpmPackage(value = "monaco-editor", version = "^0.40.0")
@NpmPackage(value = "linked-list-typescript", version = "latest")
@NpmPackage(value = "linked-list-typescript", version = "latest")
@NpmPackage(value = "antlr4ts", version = "latest")
@NpmPackage(value = "antlr4ts-cli", version = "latest")
@JsModule("./src/EditorInitializer.ts")
public class EditorComponent extends Div {

    private static final Logger logger = LoggerFactory.getLogger(EditorComponent.class);

    public EditorComponent() {
        setId("editor");
        UI.getCurrent().getPage().executeJs("initializeEditor($0)", "console.log(\"Hi!\")");
    }

}
