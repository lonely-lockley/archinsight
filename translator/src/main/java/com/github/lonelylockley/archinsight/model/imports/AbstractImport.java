package com.github.lonelylockley.archinsight.model.imports;

import com.github.lonelylockley.archinsight.model.ArchLevel;
import com.github.lonelylockley.archinsight.model.Origin;
import com.github.lonelylockley.archinsight.model.ParseDescriptor;
import com.github.lonelylockley.archinsight.model.elements.AbstractElement;
import com.github.lonelylockley.archinsight.parse.WithSource;
import org.antlr.v4.runtime.CommonToken;

import java.util.Objects;

public abstract class AbstractImport extends WithSource implements Cloneable {

    private String boundedContext;
    private WithSource boundedContextSource;
    private ArchLevel level;
    private WithSource levelSource;
    private String identifier;
    private WithSource identifierSource;
    private String alias;
    private WithSource aliasSource;
    private String element;
    private WithSource elementSource;
    private ParseDescriptor originalDescriptor;
    private AbstractElement originalElement;

    public abstract String getVisibleIdentifier();

    public String getBoundedContext() {
        return boundedContext;
    }

    public void setBoundedContext(String boundedContext) {
        this.boundedContext = boundedContext;
    }

    public WithSource getBoundedContextSource() {
        return boundedContextSource;
    }

    public void setBoundedContextSource(Origin origin, CommonToken tkn) {
        this.boundedContextSource = new WithSource() {};
        this.boundedContextSource.setSource(origin, tkn);
    }

    public void setBoundedContextSource(WithSource source) {
        this.boundedContextSource = source;
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

    public void setLevelSource(Origin origin, CommonToken tkn) {
        this.levelSource = new WithSource() {};
        this.levelSource.setSource(origin, tkn);
    }

    public void setLevelSource(WithSource source) {
        this.levelSource = source;
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

    public void setIdentifierSource(WithSource source) {
        this.identifierSource = source;
    }

    public void setIdentifierSource(Origin origin, CommonToken tkn) {
        this.identifierSource = new WithSource() {};
        this.identifierSource.setSource(origin, tkn);
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

    public void setAliasSource(WithSource source) {
        this.aliasSource = source;
    }

    public void setAliasSource(Origin origin, CommonToken tkn) {
        this.aliasSource = new WithSource() {};
        this.aliasSource.setSource(origin, tkn);
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

    public void setElementSource(WithSource source) {
        this.elementSource = source;
    }

    public void setElementSource(Origin origin, CommonToken tkn) {
        this.elementSource = new WithSource() {};
        this.elementSource.setSource(origin, tkn);
    }

    public AbstractElement getOriginalElement() {
        return originalElement;
    }

    public ParseDescriptor getOriginalDescriptor() {
        return originalDescriptor;
    }

    public void setOrigination(ParseDescriptor originalDescriptor, AbstractElement originalElement) {
        this.originalDescriptor = originalDescriptor;
        this.originalElement = originalElement;
    }

    public void setLine(int line) {
        super.line = line;
    }

    public abstract boolean isAnonymous();

    @Override
    public String toString() {
        return "AbstractImport{" +
                "namespace='" + boundedContext + '\'' +
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
        return Objects.equals(boundedContext, that.boundedContext) && level == that.level && Objects.equals(identifier, that.identifier) && Objects.equals(alias, that.alias) && Objects.equals(element, that.element);
    }

    @Override
    public int hashCode() {
        return Objects.hash(boundedContext, level, identifier, alias, element);
    }

    @Override
    public AbstractImport clone() {
        return this;
    }
}
