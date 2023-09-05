package com.github.lonelylockley.archinsight.auth;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

public class JWKSet implements Serializable {

    private final List<String> keys = new ArrayList<>();

    public void add(String jwkJson) {
        this.keys.add(jwkJson);
    }

    public List<String> getKeys() {
        return keys;
    }
}
