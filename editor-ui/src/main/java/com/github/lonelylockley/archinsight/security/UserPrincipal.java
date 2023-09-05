package com.github.lonelylockley.archinsight.security;

import com.github.lonelylockley.archinsight.model.Userdata;

import java.security.Principal;
import java.util.Objects;

public class UserPrincipal implements Principal {

    private final Userdata user;

    public UserPrincipal(Userdata user) {
        this.user = user;
    }

    @Override
    public String getName() {
        return user.getId().toString();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        UserPrincipal that = (UserPrincipal) o;
        return Objects.equals(user.getId(), that.user.getId());
    }

    @Override
    public int hashCode() {
        return Objects.hash(user.getId());
    }
}
