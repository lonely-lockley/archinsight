package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.annotations.AttributeAnnotation;
import com.github.lonelylockley.archinsight.model.annotations.DeprecatedAnnotation;
import com.github.lonelylockley.archinsight.model.annotations.PlannedAnnotation;
import com.github.lonelylockley.archinsight.model.elements.*;
import com.github.lonelylockley.archinsight.model.imports.AnonymousImport;
import com.github.lonelylockley.archinsight.model.imports.NamedImport;
import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.ParserRuleContext;
import org.antlr.v4.runtime.tree.ErrorNode;
import org.antlr.v4.runtime.tree.ParseTreeListener;
import org.antlr.v4.runtime.tree.TerminalNode;

import static com.github.lonelylockley.archinsight.model.elements.ElementType.*;

public class InsightParseTreeListener implements ParseTreeListener {
    /*
     * Debug only - source of rule names
     */
    private final InsightParser parser = new InsightParser(null);

    private final ParseContext ctx = new ParseContext();
    private final TranslationContext translationContext;

    public InsightParseTreeListener(TranslationContext translationContext) {
        this.translationContext = translationContext;
    }

    protected void handleToken(CommonToken tkn) {
        switch (tkn.getType()) {
            case InsightLexer.IDENTIFIER:
                if (ctx.getCurrentElement().getType() == LINK && ctx.getCurrentImport() == null) {
                    ctx.getCurrentElementAsLink().setTo(tkn.getText());
                    ctx.getCurrentElement().setSource(tkn);
                }
                else
                if (ctx.getCurrentImport() != null) {
                    var imp = ctx.getCurrentImport();
                    if (ctx.getPreviousToken().getType() == InsightLexer.AS) {
                        imp.setAlias(tkn.getText());
                        imp.setAliasSource(tkn);
                    }
                    else if (ctx.getPreviousToken().getType() == InsightLexer.CONTEXT_IMPORT || ctx.getPreviousToken().getType() == InsightLexer.CONTAINER_IMPORT) {
                        imp.setNamespace(tkn.getText());
                        imp.setNamespaceSource(tkn);
                    }
                    else {
                        imp.setLine(tkn.getLine());
                        imp.setIdentifier(tkn.getText());
                        imp.setIdentifierSource(tkn);
                    }
                }
                else {
                    ctx.getCurrentElementWithId().setId(tkn.getText());
                    ctx.getCurrentElement().setSource(tkn);
                }
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
            case InsightLexer.ATTRIBUTE:
            case InsightLexer.PLANNED:
            case InsightLexer.DEPRECATED:
                ctx.getCurrentAnnotation().setSource(tkn);
                break;
            case InsightLexer.ANNOTATION_VALUE:
                ctx.getCurrentAnnotation().setValue(tkn.getText());
                break;
            case InsightLexer.COMMENT:
                if (ctx.commentIsNote()) {
                    ctx.getCurrentElementWithNote().setNote(tkn.getText());
                }
                break;
            case InsightLexer.IMPORT:
                ctx.getCurrentImport().setSource(tkn);
                break;
            case InsightLexer.CONTEXT_IMPORT:
                ctx.getCurrentImport().setLevel(ArchLevel.CONTEXT);
                ctx.getCurrentImport().setLevelSource(tkn);
                break;
            case InsightLexer.CONTAINER_IMPORT:
                ctx.getCurrentImport().setLevel(ArchLevel.CONTAINER);
                ctx.getCurrentImport().setLevelSource(tkn);
                break;
            case InsightLexer.CONTEXT_ELEMENT_IMPORT:
            case InsightLexer.CONTAINER_ELEMENT_IMPORT:
                ctx.getCurrentImport().setElement(tkn.getText());
                ctx.getCurrentImport().setElementSource(tkn);
                break;
            default:
                break;
        }
        ctx.setPreviousToken(tkn);
    }

    @Override
    public void visitTerminal(TerminalNode node) {
        CommonToken tkn = (CommonToken) node.getPayload();
        handleToken(tkn);
    }

    @Override
    public void visitErrorNode(ErrorNode node) {
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
            case InsightParser.RULE_attributeAnnotationDeclaration:
                AttributeAnnotation aa = new AttributeAnnotation();
                ctx.startNewAnnotation(aa);
                break;
            case InsightParser.RULE_plannedAnnotationDeclaration:
                PlannedAnnotation pa = new PlannedAnnotation();
                ctx.startNewAnnotation(pa);
                break;
            case InsightParser.RULE_deprecatedAnnotationDeclaration:
                DeprecatedAnnotation da = new DeprecatedAnnotation();
                ctx.startNewAnnotation(da);
                break;
            case InsightParser.RULE_noteDeclaration:
                ctx.nextCommentIsNote();
                break;
            case InsightParser.RULE_namedImportDeclaration:
                ctx.startNewImport(new NamedImport());
                break;
            case InsightParser.RULE_anonymousImportDeclaration:
                ctx.startNewImport(new AnonymousImport());
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
            case InsightParser.RULE_attributeAnnotationDeclaration:
            case InsightParser.RULE_plannedAnnotationDeclaration:
            case InsightParser.RULE_deprecatedAnnotationDeclaration:
                ctx.getCurrentElementsWithAnnotations().addAnnotation(ctx.getCurrentAnnotation());
                break;
            case InsightParser.RULE_noteDeclaration:
                ctx.resetNoteFlag();
                break;
            case InsightParser.RULE_namedImportDeclaration:
            case InsightParser.RULE_anonymousImportDeclaration:
                if (ctx.getCurrentElement().getType() == LINK) {
                    ctx.getCurrentElementAsLink().setTo(ctx.getCurrentImport().getAlias());
                }
                ctx.finishImport();
                break;
            default:
                break;
        }
    }

    public ParseResult getResult() {
        return new ParseResult(ctx.getCurrentElement());
    }

}
