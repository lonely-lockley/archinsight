package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.model.elements.Element;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.parse.ctx.ParseContext;
import com.github.lonelylockley.archinsight.parse.result.ParseResult;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.Vocabulary;

public interface SpecificListener {
    public boolean visitLevelSpecific(CommonToken tkn, Vocabulary vocab, ElementType nodeType, String nodeValue);
    public ParseContext getContext();
    public void addElement(ParseResult result, String identifier, Element element);
    public void setProjectName(ParseResult result, String name);
    public void exitRule(ParseResult result, String ruleName);
}
