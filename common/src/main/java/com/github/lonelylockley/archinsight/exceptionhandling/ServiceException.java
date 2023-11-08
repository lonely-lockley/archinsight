package com.github.lonelylockley.archinsight.exceptionhandling;

import com.github.lonelylockley.archinsight.model.remote.ErrorMessage;

import java.io.Serializable;

public class ServiceException extends RuntimeException implements Serializable {

    private final ErrorMessage err;

    public ServiceException(ErrorMessage err) {
        super(err.getMessage());
        this.err = err;
    }

    public ServiceException(ErrorMessage err, Throwable cause) {
        super(err.getMessage(), cause);
        this.err = err;
    }

    public ErrorMessage getError() {
        return err;
    }
}
