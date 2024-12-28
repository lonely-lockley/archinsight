package com.github.lonelylockley.archinsight.export;

import com.github.lonelylockley.archinsight.Config;

import java.util.Map;

public class ColorScheme {

    private final Map<String, String> colors;

    public ColorScheme(Config conf, boolean darkMode) {
       colors = (Map<String, String>) conf.getDiagram().get(darkMode ? "dark" : "light");
    }

    /*
     * WARN: micronaut changes underscores `_` in property names to dashes `-`
     */
    public String getElementColor() {
        return colors.get("element-color");
    }

    public String getElementFontColor() {
        return colors.get("element-font-color");
    }

    public String getEdgeColor() {
        return colors.get("edge-color");
    }

    public String getEdgeFontColor() {
        return colors.get("edge-font-color");
    }

    public String getBackground() {
        return colors.get("graph-background");
    }

    public String getInternal() {
        return colors.get("element-internal");
    }

    public String getExternal() {
        return colors.get("element-external");
    }

    public String getPlanned() {
        return colors.get("planned");
    }

    public String getDeprecated() {
        return colors.get("deprecated");
    }

    public String getActor() {
        return colors.get("actor");
    }

    public String getInternalInfra() {
        return colors.get("infra-internal");
    }

    public String getExternalInfra() {
        return colors.get("infra-external");
    }

    public String getClusterBorderColor() {
        return colors.get("cluster-border");
    }

    public String getClusterFontColor() {
        return colors.get("cluster-font-color");
    }

}
