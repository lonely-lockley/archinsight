package com.github.lonelylockley.archinsight.parse;

import com.github.lonelylockley.archinsight.TranslationUtil;
import com.github.lonelylockley.archinsight.model.Origin;
import com.github.lonelylockley.archinsight.model.TranslationContext;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.Parser;
import org.antlr.v4.runtime.atn.ATNConfigSet;
import org.antlr.v4.runtime.dfa.DFA;

import java.util.BitSet;
import java.util.UUID;

public class InsightParseErrorListener implements ANTLRErrorListener {

    private final TranslationContext ctx;
    private final Origin origin;

    public InsightParseErrorListener(TranslationContext ctx, Origin origin) {
        this.ctx = ctx;
        this.origin = origin;
    }

    @Override
    public void syntaxError(Recognizer<?, ?> recognizer, Object offendingSymbol, int line, int charPositionInLine, String msg, RecognitionException e) {
        final var tkn = (CommonToken) offendingSymbol;
        TranslatorMessage lm = new TranslatorMessage(
                MessageLevel.ERROR,
                origin.getTabId(),
                origin.getFileId(),
                origin.getLocation(),
                String.format("line %d:%d %s", line, charPositionInLine, msg)
        );
        if (tkn == null) {
            TranslationUtil.copyPosition(lm, line, charPositionInLine, e.getInputStream().index(), e.getInputStream().index() + 1);
        }
        else {
            TranslationUtil.copyPosition(lm, line, charPositionInLine, tkn.getStartIndex(), tkn.getStopIndex());
        }
        ctx.addMessage(lm);
    }

    @Override
    public void reportAmbiguity(Parser recognizer, DFA dfa, int startIndex, int stopIndex, boolean exact, BitSet ambigAlts, ATNConfigSet configs) {
    }

    @Override
    public void reportAttemptingFullContext(Parser recognizer, DFA dfa, int startIndex, int stopIndex, BitSet conflictingAlts, ATNConfigSet configs) {
    }

    @Override
    public void reportContextSensitivity(Parser recognizer, DFA dfa, int startIndex, int stopIndex, int prediction, ATNConfigSet configs) {
    }
}
