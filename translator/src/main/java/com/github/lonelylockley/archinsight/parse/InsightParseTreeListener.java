package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.DynamicId;
import com.github.lonelylockley.archinsight.model.Origin;
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

public class  InsightParseTreeListener implements ParseTreeListener {
    /*
     * Debug only - source of rule names
     */
    private final InsightParser parser = new InsightParser(null);

    private final ParseContext ctx = new ParseContext();
    private final Origin origin;

    public InsightParseTreeListener(Origin origin) {
        this.origin = origin;
    }

    protected void handleToken(CommonToken tkn) {
        switch (tkn.getType()) {
            case InsightLexer.IDENTIFIER:
                if (ctx.getCurrentElement().getType() == LINK && ctx.getCurrentImport() == null) {
                    ctx.getCurrentElementAsLink().setTo(DynamicId.fromElementId(tkn.getText()));
                    ctx.getCurrentElement().setSource(origin, tkn);
                }
                else
                if (ctx.getCurrentImport() != null) {
                    var imp = ctx.getCurrentImport();
                    if (ctx.getPreviousToken().getType() == InsightLexer.AS) {
                        imp.setAlias(tkn.getText());
                        imp.setAliasSource(origin, tkn);
                    }
                    else if (ctx.getPreviousToken().getType() == InsightLexer.CONTEXT) {
                        imp.setBoundedContext(tkn.getText());
                        imp.setBoundedContextSource(origin, tkn);
                    }
                    else if (ctx.getPreviousToken().getType() == InsightLexer.FROM && ctx.getCurrentImport().isAnonymous()) {
                        imp.setIdentifier(tkn.getText());
                        imp.setIdentifierSource(origin, tkn);
                    }
                    else {
                        imp.setLine(tkn.getLine());
                        imp.setIdentifier(tkn.getText());
                        imp.setIdentifierSource(origin, tkn);
                    }
                }
                else {
                    ctx.getCurrentElementWithId().setDeclaredId(DynamicId.fromElementId(tkn.getText()));
                    ctx.getCurrentElement().setSource(origin, tkn);
                }
                break;
            case InsightLexer.TEXT:
                ctx.addText(tkn.getText());
                break;
            case InsightLexer.ANNOTATION_VALUE:
                ctx.getCurrentAnnotation().setValue(tkn.getText());
                break;
            case InsightLexer.EXTERNAL:
                ctx.getCurrentElementWithExternal().setExternal();
                break;
            case InsightLexer.ATTRIBUTE:
            case InsightLexer.PLANNED:
            case InsightLexer.DEPRECATED:
                ctx.getCurrentAnnotation().setSource(origin, tkn);
                break;
            case InsightLexer.COMMENT:
                if (ctx.commentIsNote()) {
                    ctx.getCurrentElementWithNote().setNote(tkn.getText());
                }
                break;
            case InsightLexer.IMPORT:
                ctx.getCurrentImport().setSource(origin, tkn);
                break;
            case InsightLexer.CONTEXT:
                if (ctx.getCurrentImport() != null) {
                    ctx.getCurrentImport().setLevel(ArchLevel.CONTEXT);
                    ctx.getCurrentImport().setLevelSource(origin, tkn);
                }
                break;
            case InsightLexer.FROM:
                if (ctx.getCurrentImport().isAnonymous()) {
                    ctx.getCurrentImport().setSource(origin, ctx.getPreviousToken());
                }
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
            case InsightParser.RULE_boundedContextDeclaration:
                ctx.startNewElement(new ContextElement());
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
            case InsightParser.RULE_syncWireStatement:
            case InsightParser.RULE_asyncWireStatement:
                LinkElement le = new LinkElement();
                le.setFrom(ctx.getCurrentElementWithId().getDeclaredId());
                ctx.getCurrentElementWithChildren().addChild(le);
                ctx.startNewElement(le);
                if (ruleContext.getRuleIndex() == InsightParser.RULE_syncWireStatement) {
                    le.setSync();
                }
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
//            case InsightParser.RULE_noteDeclaration:
//                ctx.nextCommentIsNote();
//                break;
            case InsightParser.RULE_namedImportStatement:
                ctx.startNewImport(new NamedImport());
                break;
            case InsightParser.RULE_anonymousImportDeclaration:
                var ai = new AnonymousImport();
                ai.setElement(ctx.getPreviousToken().getText());
                ai.setElementSource(origin, ctx.getPreviousToken());
                ctx.startNewImport(ai);
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
            case InsightParser.RULE_systemDeclaration:
            case InsightParser.RULE_actorDeclaration:
            case InsightParser.RULE_serviceDeclaration:
                if (ctx.getCurrentElementWithParams().getName() == null) {
                    // name is required error
                    ctx.addMessage(TranslationUtil.newError(
                        ctx.getCurrentElement(), "`name` parameter is required"
                    ));
                }
                ctx.finishElement();
                break;
            case InsightParser.RULE_syncWireStatement:
            case InsightParser.RULE_asyncWireStatement:
            case InsightParser.RULE_storageDeclaration:
                ctx.finishElement();
                break;
            case InsightParser.RULE_descriptionParameter:
                if (ctx.getCurrentElementWithParams().getDescription() != null) {
                    // duplicate descriptor warning
                    var descriptorParameter = new WithSource() {};
                    descriptorParameter.setSource(origin, (CommonToken) ruleContext.getStart());
                    ctx.addMessage(TranslationUtil.newWarning(
                        descriptorParameter, "Duplicate `descriptor` parameter declared. It will overwrite previous value"
                    ));
                }
                ctx.getCurrentElementWithParams().setDescription(ctx.getCurrentText());
                break;
            case InsightParser.RULE_nameParameter:
                if (ctx.getCurrentElementWithParams().getName() != null) {
                    // duplicate name warning
                    var nameParameter = new WithSource() {
                    };
                    nameParameter.setSource(origin, (CommonToken) ruleContext.getStart());
                    ctx.addMessage(TranslationUtil.newWarning(
                        nameParameter, "Duplicate `name` parameter declared. It will overwrite previous value"
                    ));
                }
                ctx.getCurrentElementWithParams().setName(ctx.getCurrentText());
                break;
            case InsightParser.RULE_technologyParameter:
                if (ctx.getCurrentElementWithParams().getTechnology() != null) {
                    // duplicate descriptor warning
                    var technologyParameter = new WithSource() {
                    };
                    technologyParameter.setSource(origin, (CommonToken) ruleContext.getStart());
                    ctx.addMessage(TranslationUtil.newWarning(
                        technologyParameter, "Duplicate `technology` parameter declared. It will overwrite previous value"
                    ));
                }
                ctx.getCurrentElementWithParams().setTechnology(ctx.getCurrentText());
                break;
//            case InsightParser.RULE_noteDeclaration:
//                ctx.resetNoteFlag();
//                break;
            case InsightParser.RULE_anonymousImportDeclaration:
                ctx.getCurrentElementAsLink().setTo(ctx.getCurrentImport().getAlias());
                ctx.finishImport();
                break;
            case InsightParser.RULE_annotationStatement:
                ctx.finishAnnotation();
                break;
            case InsightParser.RULE_namedImportStatement:
                ctx.finishImport();
                break;
            default:
                break;
        }
    }

    public ParseResult getResult() {
        return new ParseResult(origin, ctx.getCurrentElement(), ctx.getMessages());
    }

}
