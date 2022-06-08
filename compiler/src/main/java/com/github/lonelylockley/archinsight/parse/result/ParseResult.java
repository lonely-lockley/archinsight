package com.github.lonelylockley.archinsight.parse.result;

public class ParseResult {

    private final LevelResult context = new LevelResult();
    private final LevelResult container = new LevelResult();

    public LevelResult getContext() {
        return context;
    }

    public boolean hasContext() {
        return context.getProjectName() != null;
    }

    public LevelResult getContainer() {
        return container;
    }

    public boolean hasContainer() {
        return container.getProjectName() != null;
    }

    public String getProjectName() {
        if (context.getProjectName() != null) {
            return context.getProjectName();
        }
        else
        if (container.getProjectName() != null) {
            return container.getProjectName();
        }
        else {
            throw new IllegalArgumentException("Cannot define a project name!");
        }
    }

    @Override
    public String toString() {
        return "ParseResult [" + getProjectName() + "] {\n" +
                "===> context:\n" + context +
                "\n===> container:\n" + container +
                '}';
    }
}
