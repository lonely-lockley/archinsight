package com.github.lonelylockley.archinsight.components.dialogs;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.github.lonelylockley.archinsight.repository.FileSystem;
import com.vaadin.flow.component.Key;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.dialog.Dialog;
import com.vaadin.flow.component.textfield.TextField;

import java.util.Set;
import java.util.function.Consumer;

public class ResultReturningDialog extends Dialog {

    private final TextField textField = new TextField();
    private final String title;
    private final String textFieldName;

    public ResultReturningDialog(String title, String textFieldName, String helpText, Consumer<String> successAction) {
        this.title = title;
        this.textFieldName = textFieldName;
        setModal(true);
        setWidth("600px");
        setDraggable(false);
        textField.setWidth("100%");
        textField.setPattern(FileSystem.POSIX_FILE_NAME_PTR);
        if (helpText != null) {
            textField.setHelperText(helpText);
        }
        var saveButton = new Button("Save", e -> {
            successAction.accept(textField.getValue());
            close();
        });
        saveButton.addThemeVariants(ButtonVariant.LUMO_PRIMARY);
        saveButton.addClickShortcut(Key.ENTER);
        var cancelButton = new Button("Cancel", e -> close());
        add(textField);
        getFooter().add(cancelButton);
        getFooter().add(saveButton);
    }

    public void show(Set<RepositoryNode> selection) {
        if (!selection.isEmpty()) {
            var node = selection.iterator().next();
            var objectTypeText = RepositoryNode.TYPE_FILE.equalsIgnoreCase(node.getType()) ? "file" : "directory";
            setHeaderTitle(String.format(title, objectTypeText));
            textField.setValue(node.getName());
            textField.setLabel(String.format(textFieldName, objectTypeText));
            textField.focus();
            super.open();
        }
    }

    @Override
    public void open() {
        setHeaderTitle(title);
        textField.setLabel(textFieldName);
        textField.setValue("");
        textField.focus();
        super.open();
    }
}
