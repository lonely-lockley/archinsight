package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.elements.LinkElement;
import com.github.lonelylockley.archinsight.parse.ctx.ParseContext;
import com.github.lonelylockley.archinsight.parse.result.ParseResult;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.ParserRuleContext;
import org.antlr.v4.runtime.Vocabulary;
import org.antlr.v4.runtime.tree.ErrorNode;
import org.antlr.v4.runtime.tree.ParseTreeListener;
import org.antlr.v4.runtime.tree.TerminalNode;

import static com.github.lonelylockley.archinsight.model.elements.ElementType.*;

public class TreeListener implements ParseTreeListener {

    private final ParseResult result = new ParseResult();

    private final InsightLexer lexer;
    private final InsightParser parser;

    private ParseContext context;
    private SpecificListener continuationCallback = null;

    public TreeListener(InsightLexer lexer, InsightParser parser) {
        this.lexer = lexer;
        this.parser = parser;
    }

    protected void visitLevelDefault(CommonToken tkn, Vocabulary vocab, ElementType nodeType, String nodeValue) {
        switch (nodeType) {
            case CONTEXT:
                continuationCallback = new ContextTreeListener();
                context = continuationCallback.getContext();
                break;
            case CONTAINER:
                continuationCallback = new ContainerTreeListener();
                context = continuationCallback.getContext();
                break;
            case PROJECTNAME:
                context.setProjectName(nodeValue);
                break;
            case EXTERNAL:
                context.setExternal(true);
                break;
            case NAME:
            case DESCRIPTION:
            case TECHNOLOGY:
                context.setParameter(nodeValue);
                break;
            case TEXT:
                String text = nodeValue.trim().replaceAll("(\\n\\t{2}|\\n\\s{8})", "\\\\n");
                switch (context.currentParameter()) {
                    case "name":
                        context.currentElement().withName(text);
                        break;
                    case "desc":
                    case "description":
                        context.currentElement().withDescription(text);
                        break;
                    case "tech":
                    case "technology":
                        context.currentElement().withTechnology(text);
                        break;
                }
                break;
            case LINK:
                context.startNewLink().withFrom(context.currentIdentifier());
                switch (nodeValue) {
                    case "->":
                        ((LinkElement.Builder) context.currentElement()).withSyncFlag(true);
                        break;
                    case "~>":
                        ((LinkElement.Builder) context.currentElement()).withSyncFlag(false);
                        break;
                }
                break;
            case IDENTIFIER:
                context.setIdentifier(nodeValue);
                if (context.getType() == LINK) {
                    ((LinkElement.Builder) context.currentElement()).withTo(context.currentIdentifier());
                }
                break;
            default:
                break;
        }
    }

    @Override
    public void visitTerminal(TerminalNode node) {
        CommonToken tkn = (CommonToken) node.getPayload();
        Vocabulary vocab = lexer.getVocabulary();
        final String rawType = vocab.getSymbolicName(tkn.getType());
        final ElementType nodeType = elementByIdentifier(rawType);
        final String nodeValue = tkn.getText();
        //System.out.println("> " + nodeType + " (" + rawType + ") = " + nodeValue);
        if (continuationCallback != null && context != null) {
            if (continuationCallback.visitLevelSpecific(tkn, vocab, nodeType, nodeValue)) {
                visitLevelDefault(tkn, vocab, nodeType, nodeValue);
            }
        }
        else {
            visitLevelDefault(tkn, vocab, nodeType, nodeValue);
        }
    }

    @Override
    public void visitErrorNode(ErrorNode node) {
        throw new RuntimeException(node.getSymbol().getText() + " at " + node.getSymbol().getLine() + ":" + node.getSymbol().getCharPositionInLine());
    }

    @Override
    public void enterEveryRule(ParserRuleContext ctx) {
        //String ruleName = parser.getRuleNames()[ctx.getRuleIndex()];
        //System.out.println(">>> " + ruleName);
    }

    @Override
    public void exitEveryRule(ParserRuleContext ctx) {
        String ruleName = parser.getRuleNames()[ctx.getRuleIndex()];
        //System.out.println("<<< " + ruleName);
        if (("ruleEnd".equals(ruleName) || "insight".equals(ruleName)) && context.currentElement() != null) {
            if (context.currentElement().getType() == ElementType.LINK) {
                continuationCallback.addElement(result, null, context.finishElement());
            }
            else {
                continuationCallback.addElement(result, context.currentIdentifier(), context.finishElement());
            }
        }
        if ("insight".equals(ruleName)) {
            continuationCallback.setProjectName(result, context.getProjectName());
        }
        continuationCallback.exitRule(result, ruleName);
    }

    public ParseResult getResult() {
        return result;
    }

}
