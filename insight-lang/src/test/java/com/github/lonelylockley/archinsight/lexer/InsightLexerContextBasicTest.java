package com.github.lonelylockley.archinsight.lexer;

import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.misc.Pair;
import org.testng.Assert;
import org.testng.annotations.*;

import java.util.Iterator;
import java.util.List;
import java.util.stream.Stream;

public class InsightLexerContextBasicTest extends TestCommon {

    @Test
    public void testContextDefinition() throws Exception {
        setup("""
                system tms
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("SYSTEM", "system"),
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
                system tms
                    service test
                        name = Test
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("SERVICE", "service"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>")
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
    public void testSystemDefinitionWithEmptyLine() throws Exception {
        setup("""
                system tms
                
                    service test
                        name = Test
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("SERVICE", "service"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>")
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
    public void testExtSystemDefinition() throws Exception {
        setup("""
                external system tms
                    service test
                        name = Test
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("EXTERNAL", "external"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("SERVICE", "service"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn -> checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 0);
        Assert.assertFalse(state.wasText());
    }
    @Test
    public void testExtSystemDefinitionWithEmptyLine() throws Exception {
        setup("""
                external system tms
                
                    storage test
                        name = Test
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("EXTERNAL", "external"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("STORAGE", "storage"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>")
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
    public void testSystemDefinitionMultilineText() throws Exception {
        setup("""
                system tms
                    storage test
                        name = Test
                            Uuu TTT
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("STORAGE", "storage"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("TEXT", "Uuu TTT"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>")
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
    public void testSystemDefinitionWithLinks() throws Exception {
        setup("""
                system tms
                    service test
                        name = Test
                            Uuu TTT
                        links:
                            -> kkk
                                technology = aa
                                description = oo
                                    ll
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("SERVICE", "service"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("TEXT", "Uuu TTT"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("LINKS", "links"),
                new Pair<>("COLON", ":"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("SWIRE", "->"),
                new Pair<>("IDENTIFIER", "kkk"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TECHNOLOGY", "technology"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "aa"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DESCRIPTION", "description"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "oo"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("TEXT", "ll"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>")
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
    public void testAnnotation() throws Exception {
        setup("""
                system tms
                
                    @attribute(test)
                    storage test
                        name = Test
                            Uuu TTT
                        links:
                            @planned()
                            -> kkk
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("ATTRIBUTE", "@attribute"),
                new Pair<>("LPAREN", "("),
                new Pair<>("ANNOTATION_VALUE", "test"),
                new Pair<>("RPAREN", ")"),
                new Pair<>("EOL", "\n"),
                new Pair<>("STORAGE", "storage"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("TEXT", "Uuu TTT"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("LINKS", "links"),
                new Pair<>("COLON", ":"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("PLANNED", "@planned"),
                new Pair<>("LPAREN", "("),
                new Pair<>("RPAREN", ")"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SWIRE", "->"),
                new Pair<>("IDENTIFIER", "kkk"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>")
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
    public void testTextProcessesEOFAsEOL() throws Exception {
        setup("system tms\n    service test\n        name = Test"
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("SERVICE", "service"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        //Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 0);
        Assert.assertFalse(state.wasText());

    }

    @Test
    public void testStatementProcessesEOFAsEOL() throws Exception {
        setup("""
                external system tms
                
                    storage test
                        name = Test
                        links:
                            -> g"""
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("EXTERNAL", "external"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("STORAGE", "storage"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("LINKS", "links"),
                new Pair<>("COLON", ":"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("SWIRE", "->"),
                new Pair<>("IDENTIFIER", "g"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>")
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

}
