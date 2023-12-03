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
                -> system ggg in context hhh
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("WIRE", "->"),
                new Pair<>("CONTEXT_ELEMENT_IMPORT", "system"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("IN", "in"),
                new Pair<>("CONTEXT_IMPORT", "context"),
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
    public void testImportSyntaxShortContextAnonymous() throws Exception {
        setup(
                """
                -> ggg in context hhh
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("WIRE", "->"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("IN", "in"),
                new Pair<>("CONTEXT_IMPORT", "context"),
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
                -> system ggg in context hhh
                    name = Test
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("WIRE", "->"),
                new Pair<>("CONTEXT_ELEMENT_IMPORT", "system"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("IN", "in"),
                new Pair<>("CONTEXT_IMPORT", "context"),
                new Pair<>("IDENTIFIER", "hhh"),
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
    public void testImportSyntaxAnonymousInContext() throws Exception {
        setup(
                """
                container tms
                
                service test
                    name = Test system
                    links:
                        -> person ggg in context hhh
                        -> kkk in context lll
                        ~> ttt
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTAINER", "container"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SERVICE", "service"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("TEXT", " "),
                new Pair<>("TEXT", "system"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("LINKS", "links"),
                new Pair<>("COLON", ":"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("WIRE", "->"),
                new Pair<>("CONTEXT_ELEMENT_IMPORT", "person"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("IN", "in"),
                new Pair<>("CONTEXT_IMPORT", "context"),
                new Pair<>("IDENTIFIER", "hhh"),
                new Pair<>("EOL", "\n"),
                new Pair<>("WIRE", "->"),
                new Pair<>("IDENTIFIER", "kkk"),
                new Pair<>("IN", "in"),
                new Pair<>("CONTEXT_IMPORT", "context"),
                new Pair<>("IDENTIFIER", "lll"),
                new Pair<>("EOL", "\n"),
                new Pair<>("WIRE", "~>"),
                new Pair<>("IDENTIFIER", "ttt"),
                new Pair<>("EOL", "\n")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 2);
        Assert.assertFalse(state.wasText());
    }

    @Test
    public void testImportSyntaxLongContainerNamed() throws Exception {
        setup(
                """
                import service ggg in container hhh as ttt
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("IMPORT", "import"),
                new Pair<>("CONTAINER_ELEMENT_IMPORT", "service"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("IN", "in"),
                new Pair<>("CONTAINER_IMPORT", "container"),
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
    public void testImportSyntaxShortContainerNamed() throws Exception {
        setup(
                """
                import ggg in container hhh as ttt
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("IMPORT", "import"),
                new Pair<>("IDENTIFIER", "ggg"),
                new Pair<>("IN", "in"),
                new Pair<>("CONTAINER_IMPORT", "container"),
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
    public void testImportSyntaxNamedInContext() throws Exception {
        setup(
                """
                container tms
                
                import jjj in context lll as ttt
                
                service test
                    name = Test system
                    links:
                        -> ttt
                """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("CONTAINER", "container"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("IMPORT", "import"),
                new Pair<>("IDENTIFIER", "jjj"),
                new Pair<>("IN", "in"),
                new Pair<>("CONTEXT_IMPORT", "context"),
                new Pair<>("IDENTIFIER", "lll"),
                new Pair<>("AS", "as"),
                new Pair<>("IDENTIFIER", "ttt"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SERVICE", "service"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("NAME", "name"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "Test"),
                new Pair<>("TEXT", " "),
                new Pair<>("TEXT", "system"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("LINKS", "links"),
                new Pair<>("COLON", ":"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("WIRE", "->"),
                new Pair<>("IDENTIFIER", "ttt"),
                new Pair<>("EOL", "\n")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn ->  checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 2);
        Assert.assertFalse(state.wasText());
    }

    @Test
    public void testImportSyntaxNamedInBoundary() throws Exception {
        setup(
                """
                        boundary bb
                            desc = 888
                                        
                            import translator in container archinsight
                        """
        );
        List<Pair<String, String>> exp = Stream.of(
                new Pair<>("BOUNDARY", "boundary"),
                new Pair<>("IDENTIFIER", "bb"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("DESCRIPTION", "desc"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "888"),
                new Pair<>("TEXT", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("IMPORT", "import"),
                new Pair<>("IDENTIFIER", "translator"),
                new Pair<>("IN", "in"),
                new Pair<>("CONTAINER_IMPORT", "container"),
                new Pair<>("IDENTIFIER", "archinsight"),
                new Pair<>("EOL", "\n")
        ).toList();
        Iterator<Pair<String, String>> it = exp.iterator();
        List<? extends Token> act = lexer.getAllTokens();
        Assert.assertEquals(act.size(), exp.size());
        act.forEach(tkn -> checkElement((CommonToken) tkn, it.next()));
        Assert.assertFalse(it.hasNext());
        LexerState state = lexer.snapshotState();
        Assert.assertEquals(state.getIndentation(), 1);
        Assert.assertFalse(state.wasText());
    }
}
