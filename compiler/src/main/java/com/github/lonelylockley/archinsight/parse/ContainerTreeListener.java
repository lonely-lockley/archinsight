package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.elements.Element;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.elements.ModuleElement;
import com.github.lonelylockley.archinsight.parse.ctx.ContainerLevelParseContext;
import com.github.lonelylockley.archinsight.parse.ctx.ParseContext;
import com.github.lonelylockley.archinsight.parse.result.ParseResult;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.Vocabulary;

public class ContainerTreeListener implements SpecificListener {

    private final ContainerLevelParseContext ctx = new ContainerLevelParseContext();

    @Override
    public boolean visitLevelSpecific(CommonToken tkn, Vocabulary vocab, ElementType nodeType, String nodeValue) {
        boolean continueMatch = true;
        switch (nodeType) {
            case SERVICE:
                ctx.startNewService().withExternalFlag(ctx.isExternal());
                continueMatch = false;
                break;
            case STORAGE:
                ctx.startNewStorage().withExternalFlag(ctx.isExternal());
                continueMatch = false;
                break;
            case CONTAINS:
                ctx.startNewModule();
                continueMatch = false;
                break;
            case IDENTIFIER:
                if (ctx.isParsingModule()) {
                    ctx.addContainerContent(nodeValue);
                    continueMatch = false;
                }
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
        result.getContainer().addElement(identifier, element);
    }

    @Override
    public void setProjectName(ParseResult result, String name) {
        result.getContainer().setProjectName(name);
    }

    @Override
    public void exitRule(ParseResult result, String ruleName) {
        if (ctx.isParsingModule() && "identifierList".equals(ruleName)) {
            ModuleElement.Builder builder = (ModuleElement.Builder) ctx.currentElement();
            builder.withContent(ctx.getContainerContent());
            addElement(result, ctx.currentIdentifier(), ctx.finishElement());
        }
    }

}
