import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.tree.ErrorNode;
import org.antlr.v4.runtime.tree.ParseTreeListener;
import org.antlr.v4.runtime.tree.TerminalNode;

import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import static com.github.lonelylockley.archinsight.model.elements.ElementType.elementByIdentifier;

public class Test2 {

    public static void main(String... args) throws Exception {
        something();
    }

    public static void something() throws Exception {
//        String exprText = String.join("\n", Files.readAllLines(Paths.get("local/quick_brow_fox.txt"), StandardCharsets.UTF_8));
//        String exprText = String.join("\n", Files.readAllLines(Paths.get("local/new_syntax"), StandardCharsets.UTF_8));
//        String exprText = String.join("\n", Files.readAllLines(Paths.get("local/tms_context.ai"), StandardCharsets.UTF_8));
        String exprText = String.join("\n", Files.readAllLines(Paths.get("local/tms_container.ai"), StandardCharsets.UTF_8));
        CodePointCharStream inputStream = CharStreams.fromReader(new StringReader(exprText));
        InsightLexer lexer = new InsightLexer(inputStream);
        CommonTokenStream tokenStream = new CommonTokenStream(lexer);
        InsightParser parser = new InsightParser(tokenStream);
        parser.addParseListener(new ParseTreeListener() {
            @Override
            public void visitTerminal(TerminalNode node) {
                CommonToken tkn = (CommonToken) node.getPayload();
                Vocabulary vocab = lexer.getVocabulary();
                final String rawType = vocab.getSymbolicName(tkn.getType());
                final ElementType nodeType = elementByIdentifier(rawType);
                final String nodeValue = tkn.getText();
                System.out.println(">>>> " + nodeType + " (" + rawType + ") = " + nodeValue);
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

}
