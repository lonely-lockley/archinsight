package com.github.lonelylockley.archinsight.lexer;

import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.misc.Pair;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Iterator;
import java.util.List;
import java.util.stream.Stream;

public class InsightLexerSingleLineBasicTest extends TestCommon {

    @Test
    public void testContextDefinition() throws Exception {
        setupSingleLine(
                """
                
                system tms
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("EOL", "\n"),
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
        LexerState state = new LexerState();
        setupSingleLine(
                """
                
                    name = Test
                """
        );
        lexer.restoreState(state);
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test")
        ).toList();
        Iterator<Pair<String, String>> it2 = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it2.next()));
        Assert.assertFalse(it2.hasNext());
        state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 1);
        Assert.assertTrue(state.wasText());
    }

    @Test
    public void testSystemDefinitionMultilineText() throws Exception {
        LexerState state = new LexerState();
        state.incIndentation();
        state.setWasText();
        setupSingleLine(
                """
                
                        Uuu TTT
                """
        );
        lexer.restoreState(state);
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("TEXT", "\n"),
                new Pair<>("TEXT", "Uuu TTT")
        ).toList();
        Iterator<Pair<String, String>> it3 = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it3.next()));
        Assert.assertFalse(it3.hasNext());
        state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 1);
        Assert.assertTrue(state.wasText());
    }

    @Test
    public void testSystemDefinitionSingleLineTextCorrectExit() throws Exception {
        LexerState state = new LexerState();
        state.incIndentation();
        state.setWasText();
        setupSingleLine(
                """
                
                    description = vvv g
                """
        );
        lexer.restoreState(state);
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DESCRIPTION", "description"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "vvv g")
        ).toList();
        Iterator<Pair<String, String>> it3 = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it3.next()));
        Assert.assertFalse(it3.hasNext());
        state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 1);
        Assert.assertTrue(state.wasText());
    }

    @Test
    public void testSystemDefinitionMultilineTextCorrectExit() throws Exception {
        LexerState state = new LexerState();
        state.incIndentation();
        state.setWasText();
        setupSingleLine(
                """
                
                system nnn
                """
        );
        lexer.restoreState(state);
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
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
