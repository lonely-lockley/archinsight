package com.github.lonelylockley.archinsight.components.dialogs;

import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import com.vaadin.flow.component.Key;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.dialog.Dialog;
import com.vaadin.flow.component.html.Span;

import java.util.Set;

public class ConfirmDialog extends Dialog {

    private final String confirmationQuestionPattern;
    private final Span questionDisplay = new Span();

    public ConfirmDialog(String title, String confirmationQuestionPattern, Runnable successAction) {
        this.confirmationQuestionPattern = confirmationQuestionPattern;
        setHeaderTitle(title);
        setModal(true);
        setWidth("600px");
        setDraggable(false);
        var okButton = new Button("Ok", e -> {
            successAction.run();
            close();
        });
        okButton.addThemeVariants(ButtonVariant.LUMO_PRIMARY);
        okButton.addClickShortcut(Key.ENTER);
        var cancelButton = new Button("Cancel", e -> close());
        add(questionDisplay);
        getFooter().add(cancelButton);
        getFooter().add(okButton);
    }

    public void show(Set<RepositoryNode> selection) {
        if (!selection.isEmpty()) {
            var node = selection.iterator().next();
            var objectTypeText = RepositoryNode.TYPE_FILE.equalsIgnoreCase(node.getType()) ? "file" : "directory";
            questionDisplay.setText(String.format(confirmationQuestionPattern, objectTypeText, node.getName()));
            super.open();
        }
    }

}
