package com.github.lonelylockley.archinsight;

import java.nio.charset.StandardCharsets;

public class Validations {

    public static boolean fileContentLengthIsUnder1MB(String content) {
        return content == null || content.getBytes(StandardCharsets.UTF_8).length < 1048576;
    }

    public static boolean repositoryNameLengthBetween3And50(String name) {
        return name != null && name.length() >= 3 && name.length() <= 50;
    }
}
