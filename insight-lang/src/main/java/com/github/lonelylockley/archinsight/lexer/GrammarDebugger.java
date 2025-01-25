package com.github.lonelylockley.archinsight.lexer;

import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.atn.ATNConfigSet;
import org.antlr.v4.runtime.dfa.DFA;
import org.antlr.v4.runtime.tree.ErrorNode;
import org.antlr.v4.runtime.tree.ParseTreeListener;
import org.antlr.v4.runtime.tree.TerminalNode;

import javax.swing.*;
import javax.swing.event.CaretEvent;
import javax.swing.event.CaretListener;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;
import javax.swing.tree.*;
import java.awt.*;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;
import java.io.StringReader;
import java.util.BitSet;
import java.util.Enumeration;
import java.util.LinkedList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class GrammarDebugger {

    private static final ScheduledExecutorService exec = Executors.newSingleThreadScheduledExecutor();

    private static JPanel errorsView = new JPanel();

    public static void main(String... args) {
        final var wnd = new JFrame("Insight language Grammar Debugger");
        wnd.setSize(1024, 900);
        wnd.setLayout(new BorderLayout(5, 5));
        final var positionLb = new JLabel("  Caret position  @1 0:0  pos=0-0");
        positionLb.setSize(1024, 40);
        positionLb.setForeground(new Color(128, 0, 128));
//        wnd.setLayout(new BorderLayout(5, 5));
        final var tree = new JTree();
        tree.setModel(new DefaultTreeModel(null));
        tree.setCellRenderer(new CustomTreeCellRenderer());
        final var treeScroll = new JScrollPane(tree);
        treeScroll.setHorizontalScrollBarPolicy(JScrollPane.HORIZONTAL_SCROLLBAR_AS_NEEDED);
        final var txt = new JTextArea("""
               # rtjkg nrjgn
               context tms
               import ai from context archinsight as extr
               system g
                   name = GG
               
               system t
                   name = TTT
                       PPP
                   links:
                       -> uu
               
                   @planned(kkk)
                   service pp
                       name = ii
                       description = kkk
                       links:
                           -> uu from ai
               
                   storage pp
                       technology = iii
                       description = kkk
               
               @deprecated
               actor charlie
                   name = Chaplin""");
        txt.setRows(20);
        txt.setColumns(60);
        txt.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 13));
        txt.setTabSize(4);
        final var scroll = new JScrollPane(txt);
        final var listener = new DocumentListener() {
            // detect txt document changes
            // <editor-fold defaultstate="collapsed">
            @Override
            public void insertUpdate(DocumentEvent e) {
                changed = true;
                lastUpdate = System.currentTimeMillis();
            }

            @Override
            public void removeUpdate(DocumentEvent e) {
                changed = true;
                lastUpdate = System.currentTimeMillis();
            }

            @Override
            public void changedUpdate(DocumentEvent e) {
                changed = true;
                lastUpdate = System.currentTimeMillis();
            }
            // </editor-fold>

            private long lastUpdate = System.currentTimeMillis();
            private boolean changed = true;

            // run parser
            // <editor-fold defaultstate="collapsed">
            public void suggest() {
                if (changed && System.currentTimeMillis() - lastUpdate > 1000) {
                    try {
                        var line = txt.getLineOfOffset(txt.getCaretPosition());
                        var column = txt.getCaretPosition() - txt.getLineStartOffset(line);
//                        var text = txt.getText(0, txt.getLineEndOffset(line));
                        var text = txt.getText(0, txt.getCaretPosition());
                        //complete(text, line + 1, column, rules, tokens);
                        parse(txt.getText(), line + 1, column, tree);
                    }
                    catch (Exception ex) {
                        System.err.println(ex.getMessage());
                        ex.printStackTrace(System.err);
                    }
                    finally {
                        changed = false;
                    }
                }
            }
            // </editor-fold>
        };
        txt.getDocument().addDocumentListener(listener);
        txt.addKeyListener(new KeyAdapter() {
            @Override
            public void keyReleased(KeyEvent e) {
                // Option/ALt key marks document as changed leading to parse
                // <editor-fold defaultstate="collapsed">
                if (e.getKeyCode() == KeyEvent.VK_META) {
                    listener.changed = true;
                }
                super.keyReleased(e);
                // </editor-fold>
            }
        });
        txt.addCaretListener(new CaretListener() {
            // calculate caret position for positionLb
            // <editor-fold defaultstate="collapsed">
            @Override
            public void caretUpdate(CaretEvent e) {
                try {
                    int caretPosition = txt.getCaretPosition();
                    int line = txt.getLineOfOffset(caretPosition);
                    int column = caretPosition - txt.getLineStartOffset(line);
                    int inLineFrom = e.getDot() == e.getMark() ? column : column - (e.getDot() - e.getMark());
                    int inLineTo = e.getDot() == e.getMark() ? column : column - 1;
                    int from = e.getMark();
                    int to = e.getDot() == e.getMark() ? e.getDot() : e.getDot() - 1;
                    positionLb.setText(String.format("  Caret position  @%d %d:%d  pos=%d-%d", line + 1, from, to, inLineFrom, inLineTo));
                }
                catch (Exception ex) {
                    positionLb.setText(ex.getMessage());
                }
            }
            // </editor-fold>
        });
        exec.scheduleAtFixedRate(listener::suggest, 100, 100, TimeUnit.MILLISECONDS);
        final var topPanel = new JPanel();
        topPanel.setLayout(new BorderLayout());
        topPanel.add(scroll, BorderLayout.WEST);
        topPanel.add(positionLb, BorderLayout.SOUTH);
        errorsView.setLayout(new BoxLayout(errorsView, BoxLayout.Y_AXIS));
        topPanel.add(errorsView, BorderLayout.EAST);
        wnd.add(topPanel, BorderLayout.NORTH);
        wnd.add(treeScroll, BorderLayout.CENTER);
        wnd.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        wnd.setLocationRelativeTo(null);
        wnd.setVisible(true);
    }

    private static String escapeHtml(String src) {
        return src
                .replaceAll("\n", "&#92;n")
                .replaceAll("\t", "&#92;t")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;");
    }

    public static void parse(final String source, final int line, final int column, final JTree tree) {
        System.out.printf("Parsing text until %d:%d. Text length: %d%n", line, column, source.length());
        try {
            CodePointCharStream inputStream = CharStreams.fromReader(new StringReader(source));
            final var lexer = new InsightLexer(inputStream);
            lexer.removeErrorListeners();
            lexer.addErrorListener(new CustomErrorListener("lexer"));
            final var parser = new InsightParser(new CommonTokenStream(lexer));
            parser.removeErrorListeners();
            parser.addErrorListener(new CustomErrorListener("parser"));
            final var listener = new ParseTreeListener() {
                // parse tree listener - filling in the tree
                // <editor-fold defaultstate="collapsed">
                private LinkedList<DefaultMutableTreeNode> stack = new LinkedList<>();
                private DefaultMutableTreeNode root = null;

                @Override
                public void visitTerminal(TerminalNode node) {
                    final CommonToken tkn = (CommonToken) node.getSymbol();
                    final String rawType = lexer.getVocabulary().getSymbolicName(tkn.getType());
                    final var text = String.format("<html><b>%s</b> <span style=\"color:blue;\">@%d:%d-%s</span> <span style=\"color:#aaa;\">[idx=%d, mode=%s, <span style=\"color:#4B0082;\">pos=%d-%d</span>] =</span> <span style=\"color:green;\">`%s`</span></html>",
                            rawType,
                            tkn.getLine(),
                            tkn.getStartIndex(),
                            tkn.getStopIndex(),
                            tkn.getTokenIndex(),
                            lexer.getModeNames()[lexer._mode],
                            node.getSymbol().getCharPositionInLine(),
                            node.getSymbol().getCharPositionInLine() + (node.getText() == null ? 0 : node.getText().length()) - 1,
                            escapeHtml(tkn.getText())
                    );
                    DefaultMutableTreeNode leaf = new DefaultMutableTreeNode(text);
                    stack.peek().add(leaf);
                }

                @Override
                public void visitErrorNode(ErrorNode node) {
                    //System.out.println("--- ");
                }

                @Override
                public void enterEveryRule(ParserRuleContext ctx) {
                    String ruleName = parser.getRuleNames()[ctx.getRuleIndex()];
                    DefaultMutableTreeNode node = new DefaultMutableTreeNode(ruleName);
                    if (!stack.isEmpty()) {
                        stack.peek().add(node);
                    }
                    else {
                        root = node;
                    }
                    stack.push(node);
                }

                @Override
                public void exitEveryRule(ParserRuleContext ctx) {
                    String ruleName = parser.getRuleNames()[ctx.getRuleIndex()];
                    final var text = String.format("<html><span style=\"color:#555;\">%s @%d-%d %d:%d</span></html>",
                            ruleName,
                            ctx.getStart().getLine(),
                            ctx.getStop().getLine(),
                            ctx.getStart().getStartIndex(),
                            ctx.getStop().getStopIndex());
                    stack.peek().setUserObject(text);
                    stack.pop();
                }
                // </editor-fold>
            };
            parser.addParseListener(listener);

            try {
                parser.insight();
            }
            catch (Exception ex) {
                ex.printStackTrace();
            }
            tree.setModel(new DefaultTreeModel(listener.root));
            if (listener.root != null) {
                expandAll(tree, new TreePath(listener.root), true);
            }
        }
        catch (Exception ex) {
            System.err.println(ex.getMessage());
            ex.printStackTrace(System.err);
        }
    }

    private static void expandAll(JTree tree, TreePath parent, boolean expand) {
        TreeNode node = (TreeNode) parent.getLastPathComponent();
        if (node.getChildCount() >= 0) {
            for (Enumeration<?> e = node.children(); e.hasMoreElements();) {
                TreeNode n = (TreeNode) e.nextElement();
                TreePath path = parent.pathByAddingChild(n);
                expandAll(tree, path, expand);
            }
        }

        if (expand) {
            tree.expandPath(parent);
        } else {
            tree.collapsePath(parent);
        }
    }

    static class CustomTreeCellRenderer extends DefaultTreeCellRenderer {
        // display tree items
        // <editor-fold defaultstate="collapsed">
        @Override
        public Component getTreeCellRendererComponent(
                JTree tree,
                Object value,
                boolean selected,
                boolean expanded,
                boolean leaf,
                int row,
                boolean hasFocus) {

            final var dmtn = (DefaultMutableTreeNode) value;

            // Базовая настройка компонента
            Component c = super.getTreeCellRendererComponent(tree, value, selected, expanded, leaf, row, hasFocus);

            if (c instanceof JLabel) {
                JLabel label = (JLabel) c;
                label.setForeground(new Color(1, 1, 1));
                label.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 13));
                label.setText((String) dmtn.getUserObject());
                label.setOpaque(selected);
            }

            return c;
        }
        // </editor-fold>
    }

    static class CustomErrorListener implements ANTLRErrorListener {
        // lexer and parser error listener
        // <editor-fold defaultstate="collapsed">
        private final String source;

        public CustomErrorListener(String source) {
            this.source = source;
            errorsView.removeAll();
            errorsView.repaint();
        }

        private void reportError(String msg, Color color) {
            var lb = new JLabel();
            lb.setText(String.format("<html><b>%s</b></html>", escapeHtml(msg)));
            lb.setForeground(color);
            lb.setPreferredSize(new Dimension(512, 40));
            errorsView.add(Box.createVerticalStrut(10));
            errorsView.add(lb);
            System.err.println(msg);
        }

        @Override
        public void syntaxError(Recognizer<?, ?> recognizer, Object offendingSymbol, int line, int charPositionInLine, String msg, RecognitionException e) {
            var tkn = (CommonToken) offendingSymbol;
            reportError(
                    String.format("[%s] line %d:%d %s", source, line, charPositionInLine, msg),
                    Color.RED
            );
        }

        @Override
        public void reportAmbiguity(Parser recognizer, DFA dfa, int startIndex, int stopIndex, boolean exact, BitSet ambigAlts, ATNConfigSet configs) {
            reportError(
                    String.format("[%s] ambigiuty detected in interval: %d-%d", source, startIndex, stopIndex),
                    Color.ORANGE
            );
        }

        @Override
        public void reportAttemptingFullContext(Parser recognizer, DFA dfa, int startIndex, int stopIndex, BitSet conflictingAlts, ATNConfigSet configs) {
            reportError(
                    String.format("[%s] full context attempt (whatever the hell it is): %d-%d", source, startIndex, stopIndex),
                    Color.ORANGE
            );
        }

        @Override
        public void reportContextSensitivity(Parser recognizer, DFA dfa, int startIndex, int stopIndex, int prediction, ATNConfigSet configs) {
            reportError(
                    String.format("[%s] context sensitivity report (whatever the hell it is): %d-%d", source, startIndex, stopIndex),
                    Color.ORANGE
            );
        }
        // </editor-fold>
    }

}
