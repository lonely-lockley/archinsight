package com.github.lonelylockley.archinsight.lexer;

import com.github.lonelylockley.insight.lang.InsightLexer;
import com.github.lonelylockley.insight.lang.InsightParser;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.tree.ErrorNode;
import org.antlr.v4.runtime.tree.ParseTreeListener;
import org.antlr.v4.runtime.tree.TerminalNode;

import javax.swing.*;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;
import javax.swing.tree.DefaultMutableTreeNode;
import javax.swing.tree.DefaultTreeModel;
import javax.swing.tree.TreeNode;
import javax.swing.tree.TreePath;
import java.awt.*;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;
import java.io.StringReader;
import java.util.Enumeration;
import java.util.LinkedList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class GrammarDebugger {

    private static final ScheduledExecutorService exec = Executors.newSingleThreadScheduledExecutor();

    public static void main(String... args) {
        final var wnd = new JFrame("Insight language Grammar Debugger");
        wnd.setSize(1024, 900);
        wnd.setLayout(new GridLayout(2, 1, 5, 5));
        final var tree = new JTree();
        tree.setModel(new DefaultTreeModel(null));
        final var treeScroll = new JScrollPane(tree);
        treeScroll.setHorizontalScrollBarPolicy(JScrollPane.HORIZONTAL_SCROLLBAR_AS_NEEDED);
        final var txt = new JTextArea("""
                context debug
                
                import system hhh from context ddd
                
                system test
                    name = TEST
                
                    @attribute(123)
                    service rr
                        name = RR
                        links:
                            -> jjj from hhh
                                call = /api/test

                system yyy
                """);
        final var scroll = new JScrollPane(txt);
        final var listener = new DocumentListener() {
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
        };
        txt.getDocument().addDocumentListener(listener);
        txt.addKeyListener(new KeyAdapter() {
            @Override
            public void keyReleased(KeyEvent e) {
                if (e.getKeyCode() == KeyEvent.VK_META) {
                    listener.changed = true;
                }
                super.keyReleased(e);
            }
        });
        exec.scheduleAtFixedRate(listener::suggest, 100, 100, TimeUnit.MILLISECONDS);
        wnd.add(scroll);
        wnd.add(treeScroll);
        wnd.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        wnd.setLocationRelativeTo(null);
        wnd.setVisible(true);
    }

    public static void parse(final String source, final int line, final int column, final JTree tree) {
        System.out.printf("Parsing text until %d:%d. Text length: %d%n", line, column, source.length());
        try {
            CodePointCharStream inputStream = CharStreams.fromReader(new StringReader(source));
            final var lexer = new InsightLexer(inputStream);
//        lexer.removeErrorListeners();
            final var parser = new InsightParser(new CommonTokenStream(lexer));
//        parser.removeErrorListeners();
            final var listener = new ParseTreeListener() {

                private LinkedList<DefaultMutableTreeNode> stack = new LinkedList<>();
                private DefaultMutableTreeNode root = null;

                @Override
                public void visitTerminal(TerminalNode node) {
                    final CommonToken tkn = (CommonToken) node.getSymbol();
                    final String rawType = lexer.getVocabulary().getSymbolicName(tkn.getType());
                    final var text = String.format("%s @%d:%d-%s [idx=%d, mode=%s, channel=%s] = `" + tkn.getText() + "`", rawType, tkn.getLine(), tkn.getStartIndex(), tkn.getStopIndex(), tkn.getTokenIndex(), lexer.getModeNames()[lexer._mode], lexer.getChannelNames()[node.getSymbol().getChannel()]);
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
                    final var text = String.format("%s @%d-%d %d:%d", ruleName, ctx.getStart().getLine(), ctx.getStop().getLine(), ctx.getStart().getStartIndex(), ctx.getStop().getStopIndex());
                    stack.peek().setUserObject(text);
                    stack.pop();
                }
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

}
