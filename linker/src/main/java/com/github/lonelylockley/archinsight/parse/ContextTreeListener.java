package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.elements.Element;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.parse.ctx.ContextLevelParseContext;
import com.github.lonelylockley.archinsight.parse.ctx.ParseContext;
import com.github.lonelylockley.archinsight.parse.result.ParseResult;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.Vocabulary;

public class ContextTreeListener implements SpecificListener {

    private final ContextLevelParseContext ctx = new ContextLevelParseContext();

    @Override
    public boolean visitLevelSpecific(CommonToken tkn, Vocabulary vocab, ElementType nodeType, String nodeValue) {
        boolean continueMatch = true;
        //System.out.println("------ " + tkn + nodeType + " / " + nodeValue);
        switch (nodeType) {
            case SYSTEM:
                ctx.startNewSystem().withExternalFlag(ctx.isExternal());
                continueMatch = false;
                break;
            case PERSON:
                ctx.startNewPerson();
                continueMatch = false;
                break;
            default:
                break;
        }
        return continueMatch;
    }

    @Override
    public ParseContext getContext() {
        return ctx;
    }

    @Override
    public void addElement(ParseResult result, String identifier, Element element) {
        result.getContext().addElement(identifier, element);
    }

    @Override
    public void setProjectName(ParseResult result, String name) {
        result.getContext().setProjectName(name);
    }

    @Override
    public void exitRule(ParseResult result, String ruleName) {

    }

}
