package com.github.lonelylockley.archinsight.components;

import com.vaadin.flow.component.icon.VaadinIcon;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.data.provider.hierarchy.TreeDataProvider;
import com.vaadin.flow.data.value.ValueChangeMode;
import org.apache.commons.lang3.StringUtils;

public class StructureFilterComponent extends VerticalLayout {

    public StructureFilterComponent(final StructureViewComponent treeView) {
        final var providerWithFilterSupport = (TreeDataProvider<StructureViewComponent.DeclarationWithParent>) treeView.getDataProvider();
        final var filter = new TextField();
        filter.getStyle()
                .setMarginLeft("3%")
                .setWidth("94%")
                .setMarginTop("10px")
                .setMarginBottom("10px");
        filter.setClearButtonVisible(true);
        final var filterIcon = VaadinIcon.FILTER.create();
        filterIcon.getStyle()
                .set("color", "var(--lumo-body-text-color)")
                .set("fill", "var(--lumo-body-text-color)");
        filter.setPrefixComponent(filterIcon);
        filter.setValueChangeMode(ValueChangeMode.LAZY);
        filter.addValueChangeListener(e -> {
            if (StringUtils.isBlank(e.getValue())) {
                providerWithFilterSupport.setFilter(null);
            }
            else {
                providerWithFilterSupport.setFilter(item ->
                        StringUtils.containsIgnoreCase(item.getDeclaration().getDeclaredId(), e.getValue()) ||
                        StringUtils.containsIgnoreCase(item.getDeclaration().getName(), e.getValue() ) ||
                        StringUtils.containsIgnoreCase(item.getDeclaration().getElementType(), e.getValue())
                );
            }
            treeView.expandRecursively(treeView.getTreeData().getRootItems(), 256);
        });
        setPadding(false);
        setSpacing(false);
        setWidthFull();
        setHeightFull();
        add(filter);
        add(treeView);
    }
}
