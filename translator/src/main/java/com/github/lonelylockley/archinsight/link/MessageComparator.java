package com.github.lonelylockley.archinsight.link;

import com.github.lonelylockley.archinsight.model.remote.translator.LinkerMessage;

import java.util.Comparator;

public class MessageComparator implements Comparator<LinkerMessage> {

    @Override
    public int compare(LinkerMessage left, LinkerMessage right) {
        var res = Integer.compare(left.getLevel().getPriority(), right.getLevel().getPriority());
        if (res == 0) res = Integer.compare(left.getLine(), right.getLine());
        if (res == 0) res = Integer.compare(left.getCharPosition(), right.getCharPosition());
        return res;
    }

}
