package com.github.lonelylockley.archinsight.events;

public abstract class BaseListener<T> {

    public abstract void receive(T e);

}
