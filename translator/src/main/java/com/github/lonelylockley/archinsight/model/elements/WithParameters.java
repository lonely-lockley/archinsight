package com.github.lonelylockley.archinsight.model.elements;

import com.github.lonelylockley.archinsight.parse.HasType;
import org.apache.commons.lang3.NotImplementedException;

public interface WithParameters extends HasType {
    default void setName(String name) {
        throw new NotImplementedException();
    }

    default String getName() {
        throw new NotImplementedException();
    }

    default void setDescription(String description) {
        throw new NotImplementedException();
    }

    default String getDescription() {
        throw new NotImplementedException();
    }

    default void setTechnology(String tech) {
        throw new NotImplementedException();
    }

    default String getTechnology() {
        throw new NotImplementedException();
    }

    default void setModel(String model) {
        throw new NotImplementedException();
    }

    default String getModel() {
        throw new NotImplementedException();
    }

    default void setCall(String call) {
        throw new NotImplementedException();
    }

    default String getCall() {
        throw new NotImplementedException();
    }

    default void setVia(String via) {
        throw new NotImplementedException();
    }

    default String getVia() {
        throw new NotImplementedException();
    }

}
