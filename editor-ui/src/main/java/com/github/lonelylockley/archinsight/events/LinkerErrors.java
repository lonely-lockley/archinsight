package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.translator.LinkerMessage;

import java.util.List;

public class LinkerErrors {

    private final List<LinkerMessage> errors;

    public LinkerErrors(List<LinkerMessage> errors) {
        this.errors = errors;
    }

    public List<LinkerMessage> getErrors() {
        return errors;
    }
}
