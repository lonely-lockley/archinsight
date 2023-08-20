package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.annotations.AbstractAnnotation;
import com.github.lonelylockley.archinsight.model.elements.*;

import java.util.LinkedList;

public class ParseContext {

    private final LinkedList<AbstractElement> tree = new LinkedList<>();
    private AbstractElement currentElement = null;
    private AbstractAnnotation currentAnnotation = null;
    private StringBuilder currentText = null;

    public void startNewElement(AbstractElement element) {
        tree.push(element);
        currentElement = element;
    }

    public void startNewAnnotation(AbstractAnnotation annotation) {
        this.currentAnnotation = annotation;
    }

    public AbstractAnnotation getCurrentAnnotation() {
        return currentAnnotation;
    }

    public void finishElement() {
        tree.pop();
        currentElement = tree.peek();
    }

    public void startText() {
        currentText = new StringBuilder();
    }

    public void addText(String txt) {
        currentText.append(txt);
    }

    public String getCurrentText() {
        currentText.setLength(currentText.length() - 1);
        return currentText.toString();
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

}
