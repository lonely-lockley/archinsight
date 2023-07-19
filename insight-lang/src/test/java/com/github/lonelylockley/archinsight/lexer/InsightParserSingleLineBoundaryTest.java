package com.github.lonelylockley.archinsight.lexer;

import com.github.lonelylockley.insight.lang.InsightLexer;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.Token;
import org.antlr.v4.runtime.misc.Pair;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.stream.Stream;

public class InsightParserSingleLineBoundaryTest extends TestCommon {

    @Test
    public void testContextDefinition() throws Exception {
        setup(
                """
                context tms
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 0);
        Assert.assertFalse(state.wasText());
    }

    @Test
    public void testBoundaryDefinition() throws Exception {
        LexerState state = new LexerState(InsightLexer.TEXT);
        setup(
                """
                boundary bb
                """
        );
        lexer.restoreState(state);
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("BOUNDARY", "boundary"),
                new Pair<>("IDENTIFIER", "bb"),
                new Pair<>("EOL", "\n")
        ).toList();
        Iterator<Pair<String, String>> it1 = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it1.next()));
        Assert.assertFalse(it1.hasNext());
        state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 0);
        Assert.assertFalse(state.wasText());
    }

    @Test
    public void testBoundaryDescription() throws Exception {
        LexerState state = new LexerState(InsightLexer.TEXT);
        setup(
                """
                    desc = klfvb  dlkfvb
                """
        );
        lexer.restoreState(state);
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("DESCRIPTION", "desc"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "klfvb"),
                new Pair<>("TEXT", "  "),
                new Pair<>("TEXT", "dlkfvb"),
                new Pair<>("EOL", "\n")
        ).toList();
        Iterator<Pair<String, String>> it1 = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it1.next()));
        Assert.assertFalse(it1.hasNext());
        state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 2);
        Assert.assertTrue(state.wasText());
    }

    @Test
    public void testBoundaryEmptyLine() throws Exception {
        LexerState state = new LexerState(InsightLexer.TEXT);
        setup(
                """
                
                """
        );
        lexer.restoreState(state);
        List<Pair<String, String>> exp = new ArrayList<>();
        Iterator<Pair<String, String>> it1 = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it1.next()));
        Assert.assertFalse(it1.hasNext());
        state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 0);
        Assert.assertFalse(state.wasText());
    }

    @Test
    public void testSystemDefinition() throws Exception {
        LexerState state = new LexerState(InsightLexer.TEXT);
//        state.incIndentation();
//        state.incIndentation();
//        state.setWasText();
        setup(
                """
                    system sb
                """
        );
        lexer.restoreState(state);
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "sb"),
                new Pair<>("EOL", "\n")
        ).toList();
        Iterator<Pair<String, String>> it2 = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it2.next()));
        Assert.assertFalse(it2.hasNext());
        state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 1);
        Assert.assertFalse(state.wasText());
    }

    @Test
    public void testSystemDefinitionMultilineText() throws Exception {
        LexerState state = new LexerState(InsightLexer.TEXT);
        state.incIndentation();
        setup(
                """
                        name = qu qu
                """
        );
        lexer.restoreState(state);
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "qu"),
                new Pair<>("TEXT", " "),
                new Pair<>("TEXT", "qu"),
                new Pair<>("EOL", "\n")
        ).toList();
        Iterator<Pair<String, String>> it3 = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it3.next()));
        Assert.assertFalse(it3.hasNext());
        state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 3);
        Assert.assertTrue(state.wasText());
    }

    @Test
    public void testSystemDefinitionSingleLineTextCorrectExit() throws Exception {
        LexerState state = new LexerState(InsightLexer.TEXT);
        state.incIndentation();
        state.incIndentation();
        state.setWasText();
        setup(
                """
                    desc = vvv g
                """
        );
        lexer.restoreState(state);
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DESCRIPTION", "desc"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "vvv"),
                new Pair<>("TEXT", " "),
                new Pair<>("TEXT", "g"),
                new Pair<>("EOL", "\n")
        ).toList();
        Iterator<Pair<String, String>> it3 = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it3.next()));
        Assert.assertFalse(it3.hasNext());
        state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 2);
        Assert.assertTrue(state.wasText());
    }

    @Test
    public void testSystemDefinitionMultilineTextCorrectExit() throws Exception {
        LexerState state = new LexerState(InsightLexer.TEXT);
        state.incIndentation();
        state.incIndentation();
        state.setWasText();
        setup(
                """
                system nnn
                """
        );
        lexer.restoreState(state);
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "nnn"),
                new Pair<>("EOL", "\n")
        ).toList();
        Iterator<Pair<String, String>> it3 = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it3.next()));
        Assert.assertFalse(it3.hasNext());
        state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 0);
        Assert.assertFalse(state.wasText());
    }

}
