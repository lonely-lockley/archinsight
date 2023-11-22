package com.github.lonelylockley.archinsight.lexer;

import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.misc.Pair;
import org.antlr.v4.runtime.tree.ErrorNode;
import org.antlr.v4.runtime.tree.ParseTreeListener;
import org.antlr.v4.runtime.tree.TerminalNode;
import org.testng.Assert;
import org.testng.Assert.*;
import org.testng.annotations.*;

import java.io.StringReader;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.stream.Stream;

public class InsightLexerContextBasicTest extends TestCommon {

    @Test
    public void testContextDefinition() throws Exception {
        setup("""
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
    public void testSystemDefinition() throws Exception {
        setup("""
                context tms
                system test
                    name = Test
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("TEXT", "\n")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 2);
        Assert.assertTrue(state.wasText());
    }

    @Test
    public void testSystemDefinitionWithEmptyLine() throws Exception {
        setup("""
                context tms
                
                system test
                    name = Test
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("TEXT", "\n")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 2);
        Assert.assertTrue(state.wasText());

    }

    @Test
    public void testExtSystemDefinitionWithEmptyLine() throws Exception {
        setup("""
                context tms
                ext system test
                    name = Test
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("EXTERNAL", "ext"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("TEXT", "\n")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn -> checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 2);
        Assert.assertTrue(state.wasText());
    }
    @Test
    public void testExtSystemDefinitionWithoutEmptyLine() throws Exception {
        setup("""
                context tms
                external system test
                    name = Test
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("EXTERNAL", "external"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("TEXT", "\n")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 2);
        Assert.assertTrue(state.wasText());
    }

    @Test
    public void testSystemDefinitionMultilineText() throws Exception {
        setup("""
                context tms
                system test
                    name = Test
                        Uuu TTT
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("TEXT", "Uuu"),
                new Pair<>("TEXT", " "),
                new Pair<>("TEXT", "TTT"),
                new Pair<>("TEXT", "\n")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 2);
        Assert.assertTrue(state.wasText());
    }

    @Test
    public void testSystemDefinitionWithLinks() throws Exception {
        setup("""
                context tms
                system test
                    name = Test
                        Uuu TTT
                    links:
                        -> kkk
                            tech = aa
                            desc = oo
                                ll
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("TEXT", "Uuu"),
                new Pair<>("TEXT", " "),
                new Pair<>("TEXT", "TTT"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("LINKS", "links"),
                new Pair<>("COLON", ":"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("WIRE", "->"),
                new Pair<>("IDENTIFIER", "kkk"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TECHNOLOGY", "tech"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "aa"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DESCRIPTION", "desc"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "oo"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("TEXT", "ll"),
                new Pair<>("TEXT", "\n")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 4);
        Assert.assertTrue(state.wasText());

    }

}
