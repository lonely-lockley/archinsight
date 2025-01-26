package com.github.lonelylockley.archinsight;

import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.Origin;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.parse.WithSource;
import org.antlr.v4.runtime.Token;

public class TranslationUtil {

    public static String stringify(ArchLevel level) {
        if (level == null) {
            return "";
        }
        else {
            return level.toString().toLowerCase();
        }
    }

    public static String stringify(ElementType et) {
        if (et == null) {
            return "";
        }
        else {
            return et.toString().toLowerCase();
        }
    }

    public static void copyPosition(TranslatorMessage lm, WithSource el) {
        lm.setCharPosition(el.getCharPosition());
        lm.setLine(el.getLine());
        lm.setStartIndex(el.getStartIndex());
        lm.setStopIndex(el.getStopIndex());
    }

    public static void copyPosition(TranslatorMessage lm, Token tkn) {
        lm.setCharPosition(tkn.getCharPositionInLine());
        lm.setLine(tkn.getLine());
        lm.setStartIndex(tkn.getStartIndex());
        lm.setStopIndex(tkn.getStopIndex());
    }

    public static void copyPosition(WithSource el, WithSource imp) {
        imp.clonePositionTo(el);
    }

    public static void copyPosition(TranslatorMessage lm, int line, int charPositionInLine, int startIndex, int stopIndex) {
        lm.setCharPosition(charPositionInLine);
        lm.setLine(line);
        lm.setStartIndex(startIndex);
        lm.setStopIndex(stopIndex);
    }

    public static TranslatorMessage newError(Origin origin, String message) {
        return new TranslatorMessage(
                MessageLevel.ERROR,
                origin.getTabId(),
                origin.getFileId(),
                origin.getLocation(),
                message
                );
    }

    public static TranslatorMessage newError(WithSource position, String message) {
        var tm = new TranslatorMessage(
                MessageLevel.ERROR,
                position.getOrigin().getTabId(),
                position.getOrigin().getFileId(),
                position.getOrigin().getLocation(),
                message
        );
        copyPosition(tm, position);
        return tm;
    }

    public static TranslatorMessage newWarning(WithSource position, String message) {
        var tm = new TranslatorMessage(
                MessageLevel.WARNING,
                position.getOrigin().getTabId(),
                position.getOrigin().getFileId(),
                position.getOrigin().getLocation(),
                message
        );
        copyPosition(tm, position);
        return tm;
    }

    public static TranslatorMessage newNotice(Origin origin, String message) {
        return new TranslatorMessage(
                MessageLevel.NOTICE,
                origin.getTabId(),
                origin.getFileId(),
                origin.getLocation(),
                message
        );
    }

    public static TranslatorMessage newNotice(WithSource position, String message) {
        var tm = new TranslatorMessage(
                MessageLevel.NOTICE,
                position.getOrigin().getTabId(),
                position.getOrigin().getFileId(),
                position.getOrigin().getLocation(),
                message
        );
        copyPosition(tm, position);
        return tm;
    }

}
