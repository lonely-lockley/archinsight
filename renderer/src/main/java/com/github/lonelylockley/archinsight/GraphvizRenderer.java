package com.github.lonelylockley.archinsight;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Collectors;

public class GraphvizRenderer {

    private final Path tmpDir;
    private final Path source;

    public GraphvizRenderer() throws Exception {
        tmpDir = Files.createTempDirectory("archinsight_");
        source = Files.createTempFile(tmpDir, "input", ".dot");
    }

    private String readIO(InputStream in) {
        return new BufferedReader(new InputStreamReader(in))
                        .lines()
                        .collect(Collectors.joining("\n"));
    }

    public void writeInput(String content) throws Exception {
        var writer = new BufferedWriter(new FileWriter(source.toFile()));
        writer.write(content);
        writer.close();
    }

    public String render() throws Exception {
        var builder = new ProcessBuilder();
        builder.directory(tmpDir.toFile());
        builder.command("dot", "-Tsvg", source.getFileName().toString());
        var process = builder.start();
        var stdout = readIO(process.getInputStream());
        var stderr = readIO(process.getErrorStream());
        var exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new RuntimeException("Could not render SVG! Application exited with code %d and error message: %s".formatted(exitCode, stderr));
        }
        return stdout;
    }

    public void cleanup() throws Exception {
        Files.deleteIfExists(source);
        Files.deleteIfExists(tmpDir);
    }

}
