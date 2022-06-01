package com.github.lonelylockley.archinsight.parse.result;

import com.github.lonelylockley.archinsight.model.Tuple2;
import com.github.lonelylockley.archinsight.model.elements.Element;

import java.util.ArrayList;

public class LevelResult {

    private final ArrayList<Tuple2<String, Element>> elements = new ArrayList<>();

    private String projectName;

    public ArrayList<Tuple2<String, Element>> getElements() {
        return elements;
    }

    public void addElement(String identifier, Element value) {
        elements.add(new Tuple2<>(identifier, value));
    }

    public String getProjectName() {
        return projectName;
    }

    public void setProjectName(String projectName) {
        this.projectName = projectName;
    }

    public boolean isDefined() {
        return projectName != null;
    }

    @Override
    public String toString() {
        StringBuilder bldr = new StringBuilder("+-------------------------------------------------------------------------\n");
        bldr.append("| Project <");
        bldr.append(projectName);
        bldr.append('>');
        bldr.append('\n');
        bldr.append("|-------------------------------------------------------------------------\n");
        for (Tuple2<String, Element> dbl : elements) {
            bldr.append("| ");
            bldr.append(dbl._1);
            bldr.append(" = ");
            bldr.append(dbl._2);
            bldr.append('\n');
        }
        bldr.append("+-------------------------------------------------------------------------\n");
        return bldr.toString();
    }

}
