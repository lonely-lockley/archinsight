package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.ParserRuleContext;
import org.antlr.v4.runtime.tree.ErrorNode;
import org.antlr.v4.runtime.tree.ParseTreeListener;
import org.antlr.v4.runtime.tree.TerminalNode;

import static com.github.lonelylockley.archinsight.model.elements.ElementType.*;

public class TreeListener implements ParseTreeListener {

    private ParseContext ctx = new ParseContext();

    protected void handleToken(CommonToken tkn) {
        switch (tkn.getType()) {
            case InsightLexer.IDENTIFIER:
                if (ctx.getCurrentElement().getType() == LINK) {
                    ctx.getCurrentElementAsLink().setTo(tkn.getText());
                }
                else {
                    ctx.getCurrentElementWithId().setId(tkn.getText());
                }
                ctx.getCurrentElement().setSource(tkn);
                break;
            case InsightLexer.TEXT:
                ctx.addText(tkn.getText());
                break;
            case InsightLexer.WIRE:
                if ("->".equals(tkn.getText())) {
                    ctx.getCurrentElementAsLink().setSync();
                }
                break;
            case InsightLexer.EXTERNAL:
                ctx.getCurrentElementWithExternal().setExternal();
                break;
            default:
                break;
        }
    }

    @Override
    public void visitTerminal(TerminalNode node) {
        CommonToken tkn = (CommonToken) node.getPayload();
        handleToken(tkn);
    }

    @Override
    public void visitErrorNode(ErrorNode node) {
        throw new RuntimeException(node.getSymbol().getText() + " at " + node.getSymbol().getLine() + ":" + node.getSymbol().getCharPositionInLine());
    }

    @Override
    public void enterEveryRule(ParserRuleContext ruleContext) {
//        String ruleName = parser.getRuleNames()[ruleContext.getRuleIndex()];
//        System.out.println(">>> " + ruleName);
        switch (ruleContext.getRuleIndex()) {
            case InsightParser.RULE_contextDeclaration:
                ctx.startNewElement(new ContextElement());
                break;
            case InsightParser.RULE_containerDeclaration:
                ctx.startNewElement(new ContainerElement());
                break;
            case InsightParser.RULE_boundaryForContextDeclaration:
            case InsightParser.RULE_boundaryForContainerDeclaration:
                BoundaryElement be = new BoundaryElement();
                ctx.getCurrentElementWithChildren().addChild(be);
                ctx.startNewElement(be);
                break;
            case InsightParser.RULE_descriptionParameter:
            case InsightParser.RULE_nameParameter:
            case InsightParser.RULE_technologyParameter:
                ctx.startText();
                break;
            case InsightParser.RULE_systemDeclaration:
                SystemElement se = new SystemElement();
                ctx.getCurrentElementWithChildren().addChild(se);
                ctx.startNewElement(se);
                break;
            case InsightParser.RULE_actorDeclaration:
                ActorElement ae = new ActorElement();
                ctx.getCurrentElementWithChildren().addChild(ae);
                ctx.startNewElement(ae);
                break;
            case InsightParser.RULE_serviceDeclaration:
                ServiceElement srve = new ServiceElement();
                ctx.getCurrentElementWithChildren().addChild(srve);
                ctx.startNewElement(srve);
                break;
            case InsightParser.RULE_storageDeclaration:
                StorageElement ste = new StorageElement();
                ctx.getCurrentElementWithChildren().addChild(ste);
                ctx.startNewElement(ste);
                break;
            case InsightParser.RULE_wireDeclaration:
                LinkElement le = new LinkElement();
                le.setFrom(ctx.getCurrentElementWithId().getId());
                ctx.getCurrentElementWithChildren().addChild(le);
                ctx.startNewElement(le);
                break;
            default:
                break;
        }
    }

    @Override
    public void exitEveryRule(ParserRuleContext ruleContext) {
//        String ruleName = parser.getRuleNames()[ruleContext.getRuleIndex()];
//        System.out.println("<<< " + ruleName);
        switch (ruleContext.getRuleIndex()) {
            case InsightParser.RULE_boundaryContext:
            case InsightParser.RULE_boundaryContainer:
            case InsightParser.RULE_systemDeclaration:
            case InsightParser.RULE_wireDeclaration:
            case InsightParser.RULE_actorDeclaration:
            case InsightParser.RULE_serviceDeclaration:
            case InsightParser.RULE_storageDeclaration:
                ctx.finishElement();
                break;
            case InsightParser.RULE_descriptionParameter:
                ctx.getCurrentElementWithParams().setDescription(ctx.getCurrentText());
                break;
            case InsightParser.RULE_nameParameter:
                ctx.getCurrentElementWithParams().setName(ctx.getCurrentText());
                break;
            case InsightParser.RULE_technologyParameter:
                ctx.getCurrentElementWithParams().setTechnology(ctx.getCurrentText());
                break;
            default:
                break;
        }
    }

    public ParseResult getResult() {
        return new ParseResult(ctx.getCurrentElement());
    }

}
