package com.github.lonelylockley.archinsight.lexer;

import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.Token;
import org.antlr.v4.runtime.misc.Pair;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Iterator;
import java.util.List;
import java.util.stream.Stream;

public class InsightLexerImportTest extends TestCommon {

    @Test
    public void testImportSyntaxLongContextAnonymous() throws Exception {
        setup(
                """
                -> ggg from hhh
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("SWIRE", "->"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("FROM", "from"),
                new Pair<>("IDENTIFIER", "hhh"),
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
    public void testImportSyntaxLongContextAnonymousWithParameters() throws Exception {
        setup(
                """
                -> ggg from hhh
                    name = Test
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("SWIRE", "->"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("FROM", "from"),
                new Pair<>("IDENTIFIER", "hhh"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
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
    public void testImportSyntaxAnonymousInContext() throws Exception {
        setup(
                """
                context tms
                
                system ggg
                    name = GGG
                
                    service test
                        name = Test system
                        links:
                            -> person from hhh
                            -> kkk from lll
                            ~> ttt
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "GGG"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SERVICE", "service"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test system"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("LINKS", "links"),
                new Pair<>("COLON", ":"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("SWIRE", "->"),
                new Pair<>("IDENTIFIER", "person"),
                new Pair<>("FROM", "from"),
                new Pair<>("IDENTIFIER", "hhh"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SWIRE", "->"),
                new Pair<>("IDENTIFIER", "kkk"),
                new Pair<>("FROM", "from"),
                new Pair<>("IDENTIFIER", "lll"),
                new Pair<>("EOL", "\n"),
                new Pair<>("AWIRE", "~>"),
                new Pair<>("IDENTIFIER", "ttt"),
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
    public void testNamedImportSyntaxWithAlias() throws Exception {
        setup(
                """
                import ggg from context hhh as ttt
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("IMPORT", "import"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("FROM", "from"),
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "hhh"),
                new Pair<>("AS", "as"),
                new Pair<>("IDENTIFIER", "ttt"),
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
    public void testNamedImportSyntaxWithouAlias() throws Exception {
        setup(
                """
                import ggg from context hhh
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("IMPORT", "import"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("FROM", "from"),
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "hhh"),
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
    public void testImportSyntaxNamedInContext() throws Exception {
        setup(
                """
                context tms
                
                import jjj from context lll as ttt
                
                system ggg
                    name = GGG
                
                    service test
                        name = Test system
                        links:
                            -> ttt
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("IMPORT", "import"),
                new Pair<>("IDENTIFIER", "jjj"),
                new Pair<>("FROM", "from"),
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "lll"),
                new Pair<>("AS", "as"),
                new Pair<>("IDENTIFIER", "ttt"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "GGG"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SERVICE", "service"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("WRAP", "<WRAP>"),
                new Pair<>("TEXT", "Test system"),
                new Pair<>("UNWRAP", "<UNWRAP>"),
                new Pair<>("EOL", "\n"),
                new Pair<>("LINKS", "links"),
                new Pair<>("COLON", ":"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("SWIRE", "->"),
                new Pair<>("IDENTIFIER", "ttt"),
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
}
