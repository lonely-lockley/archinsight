package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;

import java.util.Comparator;

public class MessageComparator implements Comparator<TranslatorMessage> {

    @Override
    public int compare(TranslatorMessage left, TranslatorMessage right) {
        var res = Integer.compare(left.getLevel().getPriority(), right.getLevel().getPriority());
        if (res == 0) res = Integer.compare(left.getLine(), right.getLine());
        if (res == 0) res = Integer.compare(left.getCharPosition(), right.getCharPosition());
        return res;
    }

}
