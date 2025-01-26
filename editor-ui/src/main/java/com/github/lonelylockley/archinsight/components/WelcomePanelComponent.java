package com.github.lonelylockley.archinsight.components;

import com.github.lonelylockley.archinsight.components.helpers.SwitchListenerHelper;
import com.github.lonelylockley.archinsight.security.Authentication;
import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.Html;
import com.vaadin.flow.component.Unit;
import com.vaadin.flow.component.dependency.CssImport;
import com.vaadin.flow.component.html.H1;
import com.vaadin.flow.component.html.Hr;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;

@CssImport("./styles/shared-styles.css")
public class WelcomePanelComponent extends HorizontalLayout {

    private Component current;

    public WelcomePanelComponent(SwitchListenerHelper switchListener) {
        setSizeFull();
        setDefaultVerticalComponentAlignment(Alignment.CENTER);
        setJustifyContentMode(JustifyContentMode.CENTER);
        if (Authentication.playgroundModeEnabled()) {
            current = showForPlayground();
        }
        else  {
            current = showForNoRepo();
        }
        add(current);
    }

    public void switchToNoRepo() {
        if (Authentication.playgroundModeEnabled()) {
            return;
        }
        var tmp = showForNoRepo();
        replace(current, tmp);
        current = tmp;
    }

    public void switchToRepo() {
        if (Authentication.playgroundModeEnabled()) {
            return;
        }
        var tmp = showForRepo();
        replace(current, tmp);
        current = tmp;
    }

    private VerticalLayout initPanel(String title) {
        var res = new VerticalLayout();
        res.setWidth(650, Unit.PIXELS);
        res.addClassName("welcome-panel");
        res.add(new H1(title));
        res.add(new Hr());
        return res;
    }

    private Component showForPlayground() {
        final var res = initPanel("Archinsight playground");
        res.add(new Html("""
                <ul style="padding-right: 20px;">
                  <li>
                    Here you can explore the Insight editor and language. An example project is preloaded for you to view and edit.
                    Double-click a file to open it.
                  </li>
                  <li style="padding-top: 15px;">
                    Create new files or write your own code. Need more space? Hide the project structure with the top-left "sandwich" button
                    or read <a target="_blank" href="https://archinsight.org/doc/archinsight-editor/"><u>the editor documentation</u></a>.
                  </li>
                  <li style="padding-top: 15px;">
                    Check out the <a target="_blank" href="https://archinsight.org/doc/insight-language/"><u>Insight language spec</u></a>
                    for examples.
                  </li>
                  <li style="padding-top: 15px;">
                    In Playground mode, edits are read-only. Want full functionality? Create your own repository for free!
                  </li>
                </ul>
                """));
        res.setHeight(300, Unit.PIXELS);
        return res;
    }

    private Component showForNoRepo() {
        final var res = initPanel("Choose or create a repository");
        res.add(new Html("""
                <text style="padding-left: 20px; padding-right: 20px;">
                  <p>
                    If you want to create a new repository
                    <ul>
                      <li>Click a <i>Create Repository</i> button.</li>
                      <li>Enter the new repository name in the text field at the top of the dialog.</li>
                      <li>Click <b>Create</b> button to create a new repository and a <b>Select</b> button to open it</li>
                      <li>The repository button will change it's name to the desired one enclosed in square brackets</li>
                    </ul>
                  </p>
                  <p>
                    If you want to choose an existing repository
                    <ul>
                      <li>Click a <i>repository selection</i> button.
                      <li>Choose an existing repository in the list and click <b>Select</b> button.</li>
                    </ul>
                  </p>
                  <p>
                    <a target="_blank" href="https://archinsight.org/doc/insight-language/"><u>Insight language spec</u></a>
                    &nbsp;&nbsp;&nbsp;
                    <a target="_blank" href="https://archinsight.org/doc/archinsight-editor/"><u>Editor documentation</u></a>
                  </p>
                </text>
                """));
        res.setHeight(360, Unit.PIXELS);
        return res;
    }

    private Component showForRepo() {
        final var res = initPanel("Create file or directory");
        res.add(new Html("""
                <text style="padding-left: 20px; padding-right: 20px;">
                  <p>
                    To start editing a new file and save it later
                    <ul>
                      <li>Click a <b>New file</b> button and start writing your code.</li>
                      <li>Any time you want to save a file press command/control+S hotkey.</li>
                      <li>Or in the menu bar click <b>Source</b> and then <b>Save</b> items.</li>
                      <li>In the <i>save file</i> dialog enter file name and choose it's parent directory.</li>
                      <li>Click <b>Ok</b> to save the file.</li>
                    </ul>
                  </p>
                  <p>
                    To create a file or directory before editing
                    <ul>
                      <li>In the project structure tree select a parent directory.</li>
                      <li>Right click on the selected directory and in the context menu choose <b>Create file</b>
                      or <b>Create directory</b> item.</li>
                      <li>Enter new file or directory name.</li>
                      <li>Click <b>Ok</b> button to finish operation.</li>
                      <li>Any time you want to save a file press command/control+S hotkey.</li>
                    </ul>
                  </p>
                  <p>
                    <a target="_blank" href="https://archinsight.org/doc/insight-language/"><u>Insight language spec</u></a>
                    &nbsp;&nbsp;&nbsp;
                    <a target="_blank" href="https://archinsight.org/doc/archinsight-editor/"><u>Editor documentation</u></a>
                  </p>
                </text>
                """));
        res.setHeight(430, Unit.PIXELS);
        return res;
    }
}
