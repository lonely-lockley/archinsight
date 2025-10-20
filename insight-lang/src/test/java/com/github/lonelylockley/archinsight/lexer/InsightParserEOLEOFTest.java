package com.github.lonelylockley.archinsight.lexer;

import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.Token;
import org.antlr.v4.runtime.misc.Pair;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Iterator;
import java.util.List;
import java.util.stream.Stream;

public class InsightParserEOLEOFTest extends TestCommon {

    @Test
    public void testNameParameterValueEOF() throws Exception {
        setup(
            """
                context dd
                           
                system k
                    name = JJ"""
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "dd"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "k"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "JJ"),
                new Pair<>("UNWRAP", "<UNWRAP>")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 1);
        Assert.assertTrue(state.wasText());
    }
}
