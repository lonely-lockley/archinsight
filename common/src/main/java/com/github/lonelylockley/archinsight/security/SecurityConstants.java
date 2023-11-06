package com.github.lonelylockley.archinsight.security;

import java.util.UUID;

public class SecurityConstants {

    public static final UUID ANONYMOUS_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000000");
    public static final String USER_ID_HEADER_NAME = "X-Authenticated-User";
    public static final String USER_ROLE_HEADER_NAME = "X-Authenticated-User-Role";
    public static final String ROLE_USER = "user";
    public static final String ROLE_ANONYMOUS = "anonymous";

}
