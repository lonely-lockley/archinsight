package com.github.lonelylockley.archinsight.components.dialogs;

public interface FileDialog {

    default String ensureFileExtensionAdded(String name) {
        return name.endsWith(".ai") ? name : name + ".ai";
    }

}
