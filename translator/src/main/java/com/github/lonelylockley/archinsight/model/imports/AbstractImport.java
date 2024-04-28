package com.github.lonelylockley.archinsight.model.imports;

import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.ParsedFileDescriptor;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.parse.WithSource;
import org.antlr.v4.runtime.CommonToken;

import java.util.Objects;

public abstract class AbstractImport extends WithSource {

    private String namespace;
    private WithSource namespaceSource;
    private ArchLevel level;
    private WithSource levelSource;
    private String identifier;
    private WithSource identifierSource;
    private String alias;
    private WithSource aliasSource;
    private String element;
    private WithSource elementSource;
    private ParsedFileDescriptor originalDescriptor;
    private AbstractElement originalElement;

    public abstract String getVisibleIdentifier();

    public String getNamespace() {
        return namespace;
    }

    public void setNamespace(String namespace) {
        this.namespace = namespace;
    }

    public WithSource getNamespaceSource() {
        return namespaceSource;
    }

    public void setNamespaceSource(CommonToken tkn) {
        this.namespaceSource = new WithSource() {};
        this.namespaceSource.setSource(tkn);
    }

    public ArchLevel getLevel() {
        return level;
    }

    public void setLevel(ArchLevel level) {
        this.level = level;
    }

    public WithSource getLevelSource() {
        return levelSource;
    }

    public void setLevelSource(CommonToken tkn) {
        this.levelSource = new WithSource() {};
        this.levelSource.setSource(tkn);
    }

    public String getIdentifier() {
        return identifier;
    }

    public void setIdentifier(String identifier) {
        this.identifier = identifier;
    }

    public WithSource getIdentifierSource() {
        return identifierSource;
    }

    public void setIdentifierSource(CommonToken tkn) {
        this.identifierSource = new WithSource() {};
        this.identifierSource.setSource(tkn);
    }

    public String getAlias() {
        return alias;
    }

    public void setAlias(String alias) {
        this.alias = alias;
    }

    public WithSource getAliasSource() {
        return aliasSource;
    }

    public void setAliasSource(CommonToken tkn) {
        this.aliasSource = new WithSource() {};
        this.aliasSource.setSource(tkn);
    }

    public String getElement() {
        return element;
    }

    public void setElement(String element) {
        this.element = element;
    }

    public WithSource getElementSource() {
        return elementSource;
    }

    public void setElementSource(CommonToken tkn) {
        this.elementSource = new WithSource() {};
        this.elementSource.setSource(tkn);
    }

    public AbstractElement getOriginalElement() {
        return originalElement;
    }

    public ParsedFileDescriptor getOriginalDescriptor() {
        return originalDescriptor;
    }

    public void setOrigination(ParsedFileDescriptor originalDescriptor, AbstractElement originalElement) {
        this.originalDescriptor = originalDescriptor;
        this.originalElement = originalElement;
    }

    public void setLine(int line) {
        super.line = line;
    }

    @Override
    public String toString() {
        return "AbstractImport{" +
                "namespace='" + namespace + '\'' +
                ", level=" + level +
                ", identifier='" + identifier + '\'' +
                ", alias='" + alias + '\'' +
                ", element='" + element + '\'' +
                '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        AbstractImport that = (AbstractImport) o;
        return Objects.equals(namespace, that.namespace) && level == that.level && Objects.equals(identifier, that.identifier) && Objects.equals(alias, that.alias) && Objects.equals(element, that.element);
    }

    @Override
    public int hashCode() {
        return Objects.hash(namespace, level, identifier, alias, element);
    }
}
