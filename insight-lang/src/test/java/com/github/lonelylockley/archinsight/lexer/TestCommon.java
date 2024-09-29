package com.github.lonelylockley.archinsight.lexer;

import com.github.lonelylockley.insight.lang.InsightLexer;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.misc.Pair;
import org.testng.Assert;

import java.io.StringReader;

public abstract class TestCommon {

    protected InsightLexer lexer;

    protected void debugPrinter(Token tkn) {
        final String rawType = lexer.getVocabulary().getSymbolicName(tkn.getType());
        System.out.println("==== " + rawType + " [mode=" + lexer._mode + ",channel=" + tkn.getChannel() + "] = `" + tkn.getText() + "`");
    }

    protected void setup(String text) throws Exception {
        CodePointCharStream inputStream = CharStreams.fromReader(new StringReader(text));
        lexer = new InsightLexer(inputStream);
    }

    protected void setupSingleLine(String text) throws Exception {
        CodePointCharStream inputStream = CharStreams.fromReader(new StringReader(text));
        lexer = new InsightLexer(inputStream);
        lexer.enableSingleLineMode();
    }

    protected void checkElement(CommonToken actual, Pair<String, String> expected) {
        Vocabulary vocab = lexer.getVocabulary();
        final String actualType = vocab.getSymbolicName(actual.getType());
        final String actualValue = actual.getText();
        debugPrinter(actual);
        Assert.assertEquals(actualType, expected.a);
        Assert.assertEquals(actualValue, expected.b);
    }

}
