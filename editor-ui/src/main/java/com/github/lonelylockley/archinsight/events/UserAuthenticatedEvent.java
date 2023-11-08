package com.github.lonelylockley.archinsight.events;

import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;

public class UserAuthenticatedEvent extends BaseEvent {

    private final Userdata user;

    public UserAuthenticatedEvent(Userdata user) {
        this.user = user;
    }

    public Userdata getUser() {
        return user;
    }

}
