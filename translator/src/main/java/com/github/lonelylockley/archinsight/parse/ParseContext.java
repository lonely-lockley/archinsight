package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.annotations.AbstractAnnotation;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AbstractImport;
import org.antlr.v4.runtime.CommonToken;

import java.util.LinkedList;

public class ParseContext {

    private final LinkedList<AbstractElement> tree = new LinkedList<>();
    private AbstractElement currentElement = null;
    private AbstractAnnotation currentAnnotation = null;
    private AbstractImport currentImport = null;
    private StringBuilder currentText = null;
    private boolean nextCommentIsNote = false;
    private CommonToken previousToken = null;

    public void startNewElement(AbstractElement element) {
        tree.push(element);
        currentElement = element;
    }

    private WithImports getImportsContainer() {
        var container = tree.stream().filter(ae -> ae instanceof WithImports).findFirst();
        return (WithImports) container.orElseThrow();
    }

    public void startNewAnnotation(AbstractAnnotation annotation) {
        this.currentAnnotation = annotation;
    }

    public void startNewImport(AbstractImport importElement) {
        this.currentImport = importElement;
    }

    public void finishElement() {
        tree.pop();
        currentElement = tree.peek();
    }

    public void finishImport() {
        getImportsContainer().addImport(currentImport);
        currentImport = null;
    }

    public void startText() {
        currentText = new StringBuilder();
    }

    public void addText(String txt) {
        currentText.append(txt);
    }

    public String getCurrentText() {
        return currentText.toString().trim();
    }

    public void nextCommentIsNote() {
        nextCommentIsNote = true;
    }

    public boolean commentIsNote() {
        return nextCommentIsNote;
    }

    public void resetNoteFlag() {
        nextCommentIsNote = false;
    }

    public AbstractElement getCurrentElement() {
        return currentElement;
    }

    public WithId getCurrentElementWithId() {
        return (WithId) currentElement;
    }

    public WithParameters getCurrentElementWithParams() {
        return (WithParameters) currentElement;
    }

    public WithChildElements getCurrentElementWithChildren() {
        return (WithChildElements) currentElement;
    }

    public LinkElement getCurrentElementAsLink() {
        return (LinkElement) currentElement;
    }

    public WithAnnotations getCurrentElementsWithAnnotations() {
        return (WithAnnotations) currentElement;
    }

    public WithExternal getCurrentElementWithExternal() {
        return (WithExternal) currentElement;
    }

    public WithNote getCurrentElementWithNote() {
        return (WithNote) currentElement;
    }

    public AbstractAnnotation getCurrentAnnotation() {
        return currentAnnotation;
    }

    public AbstractImport getCurrentImport() {
        return currentImport;
    }

    public CommonToken getPreviousToken() {
        return previousToken;
    }

    public void setPreviousToken(CommonToken previousToken) {
        this.previousToken = previousToken;
    }
}
