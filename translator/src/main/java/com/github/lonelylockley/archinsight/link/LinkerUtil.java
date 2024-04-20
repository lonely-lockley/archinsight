package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.elements.ElementType;
import com.github.lonelylockley.archinsight.model.remote.translator.MessageLevel;
import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;
import com.github.lonelylockley.archinsight.parse.WithSource;
import org.antlr.v4.runtime.Token;

public class LinkerUtil {

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

    public static TranslatorMessage newError(ParsedFileDescriptor descriptor, String message) {
        return new TranslatorMessage(
                MessageLevel.ERROR,
                descriptor.getId(),
                descriptor.getFileId().orElse(null),
                descriptor.getLocation(),
                message
                );
    }

    public static TranslatorMessage newError(ParsedFileDescriptor descriptor, WithSource position, String message) {
        var tm = new TranslatorMessage(
                MessageLevel.ERROR,
                descriptor.getId(),
                descriptor.getFileId().orElse(null),
                descriptor.getLocation(),
                message
        );
        copyPosition(tm, position);
        return tm;
    }

    public static TranslatorMessage newWarning(ParsedFileDescriptor descriptor, WithSource position, String message) {
        var tm = new TranslatorMessage(
                MessageLevel.WARNING,
                descriptor.getId(),
                descriptor.getFileId().orElse(null),
                descriptor.getLocation(),
                message
        );
        copyPosition(tm, position);
        return tm;
    }
}
