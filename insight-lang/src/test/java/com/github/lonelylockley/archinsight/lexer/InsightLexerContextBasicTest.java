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

public class InsightLexerContextBasicTest extends TestCommon {

    private InsightParser parser;

    public void parse(String text, Pair<String, String>... asserts) throws Exception {
        Iterator<Pair<String, String>> it = Arrays.stream(asserts).iterator();
        CodePointCharStream inputStream = CharStreams.fromReader(new StringReader(text));
        lexer = new InsightLexer(inputStream);
        CommonTokenStream tokenStream = new CommonTokenStream(lexer);
        parser = new InsightParser(tokenStream);
        parser.addParseListener(new ParseTreeListener() {
            @Override
            public void visitTerminal(TerminalNode node) {
                CommonToken tkn = (CommonToken) node.getPayload();
                Vocabulary vocab = lexer.getVocabulary();
                final String actualType = vocab.getSymbolicName(tkn.getType());
                final String actualValue = tkn.getText();
                debugPrinter(tkn);
                Assert.assertTrue(it.hasNext());
                Pair<String, String> expected = it.next();
                Assert.assertEquals(actualType, expected.a);
                Assert.assertEquals(actualValue, expected.b);
            }

            @Override
            public void visitErrorNode(ErrorNode node) {
                throw new RuntimeException(node.getSymbol().getText() + " at " + node.getSymbol().getLine() + ":" + node.getSymbol().getCharPositionInLine());
            }

            @Override
            public void enterEveryRule(ParserRuleContext ctx) {

            }

            @Override
            public void exitEveryRule(ParserRuleContext ctx) {

            }
        });
        parser.insight();
    }

    @Test
    public void testContextDefinition() throws Exception {
        parse("""
                context tms
                """,
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("EOF", "<EOF>"));

    }

    @Test
    public void testSystemDefinitionRequiresName() throws Exception {
        Assert.assertThrows(AssertionError.class,
            new ThrowingRunnable() {
                public void run() throws Exception {
                    parse("""
                    context tms
                    system test
                    """,
                    new Pair<>("CONTEXT", "context"),
                    new Pair<>("IDENTIFIER", "tms"),
                    new Pair<>("EOL", "\n"),
                    new Pair<>("SYSTEM", "system"),
                    new Pair<>("IDENTIFIER", "test"),
                    new Pair<>("EOL", "\n"));
                }
            });

        Assert.assertThrows(AssertionError.class,
            new ThrowingRunnable() {
                public void run() throws Exception {
                    parse("""
                    context tms
                    system test
                        
                    """,
                    new Pair<>("CONTEXT", "context"),
                    new Pair<>("IDENTIFIER", "tms"),
                    new Pair<>("EOL", "\n"),
                    new Pair<>("SYSTEM", "system"),
                    new Pair<>("IDENTIFIER", "test"),
                    new Pair<>("EOL", "\n"),
                    new Pair<>("INDENT", "<INDENT>"));
                }
            });
        Assert.assertThrows(RuntimeException.class,
                new ThrowingRunnable() {
                    public void run() throws Exception {
                        parse("""
                context tms
                system test
                    desc = 123
                """,
                new Pair<>("CONTEXT", "context"),
                new Pair<>("IDENTIFIER", "tms"),
                new Pair<>("EOL", "\n"),
                new Pair<>("SYSTEM", "system"),
                new Pair<>("IDENTIFIER", "test"),
                new Pair<>("EOL", "\n"),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("DESCRIPTION", "desc"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "123"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("EOF", "<EOF>"));
                    }
                });
    }

    @Test
    public void testSystemDefinition() throws Exception {
        parse("""
                context tms
                system test
                    name = Test
                """,
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
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("EOF", "<EOF>"));

    }

    @Test
    public void testExtSystemDefinition() throws Exception {
        parse("""
                context tms
                ext system test
                    name = Test
                """,
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
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("EOF", "<EOF>"));
        parse("""
                context tms
                external system test
                    name = Test
                """,
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
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("EOF", "<EOF>"));
    }

    @Test
    public void testSystemDefinitionMultilineText() throws Exception {
        parse("""
                context tms
                system test
                    name = Test
                        Uuu TTT
                """,
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
                new Pair<>("EOL", "\n"),
                new Pair<>("TEXT", "Uuu"),
                new Pair<>("TEXT", " "),
                new Pair<>("TEXT", "TTT"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("EOF", "<EOF>"));

    }

    @Test
    public void testSystemDefinitionWithLinks() throws Exception {
        parse("""
                context tms
                system test
                    name = Test
                        Uuu TTT
                    links:
                        -> kkk
                            tech = aa
                            desc = oo
                                ll
                """,
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
                new Pair<>("EOL", "\n"),
                new Pair<>("TEXT", "Uuu"),
                new Pair<>("TEXT", " "),
                new Pair<>("TEXT", "TTT"),
                new Pair<>("EOL", "\n"),
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
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DESCRIPTION", "desc"),
                new Pair<>("EQ", "= "),
                new Pair<>("INDENT", "<INDENT>"),
                new Pair<>("TEXT", "oo"),
                new Pair<>("EOL", "\n"),
                new Pair<>("TEXT", "ll"),
                new Pair<>("EOL", "\n"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("DEDENT", "<DEDENT>"),
                new Pair<>("EOF", "<EOF>"));

    }

}
