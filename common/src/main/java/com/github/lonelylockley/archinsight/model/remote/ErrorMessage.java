package com.github.lonelylockley.archinsight.model.remote;

import io.micronaut.http.HttpStatus;

import java.io.Serializable;

public class ErrorMessage implements Serializable {
    private String message;
    private HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;

    public ErrorMessage(String message, HttpStatus status) {
        this.message = message;
        this.status = status;
    }

    public ErrorMessage(String message) {
        this.message = message;
    }

    public ErrorMessage() {
        this.message = "Internal server error";
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public void setStatus(HttpStatus status) {
        this.status = status;
    }
}
