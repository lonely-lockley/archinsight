package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.translator.TranslatorMessage;

import java.util.List;

public class LinkerErrors {

    private final List<TranslatorMessage> errors;

    public LinkerErrors(List<TranslatorMessage> errors) {
        this.errors = errors;
    }

    public List<TranslatorMessage> getErrors() {
        return errors;
    }
}
