package com.github.lonelylockley.archinsight;

import io.micronaut.core.io.IOUtils;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Collectors;

public class GraphvizRenderer implements AutoCloseable {

    private final Path tmpDir;
    private final Path source;

    public GraphvizRenderer() throws Exception {
        tmpDir = Files.createTempDirectory("archinsight_");
        source = Files.createTempFile(tmpDir, "input", ".dot");
    }

    private String readTextOutput(InputStream in) {
        return new BufferedReader(new InputStreamReader(in))
                        .lines()
                        .collect(Collectors.joining("\n"));
    }

    private byte[] readBinaryOutput(InputStream in) throws IOException {
        return in.readAllBytes();
    }

    public void writeInput(String content) throws Exception {
        var writer = new BufferedWriter(new FileWriter(source.toFile()));
        writer.write(content);
        writer.close();
    }

    public byte[] render(String format) throws Exception {
        var builder = new ProcessBuilder();
        builder.directory(tmpDir.toFile());
        builder.command("dot", "-T" + format, source.getFileName().toString());
        var process = builder.start();
        var stdout = readBinaryOutput(process.getInputStream());
        var stderr = readTextOutput(process.getErrorStream());
        var exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new RuntimeException("Could not render %s! Application exited with code %d and error message: %s".formatted(format, exitCode, stderr));
        }
        return stdout;
    }

    public void cleanup() throws Exception {
        Files.deleteIfExists(source);
        Files.deleteIfExists(tmpDir);
    }

    @Override
    public void close() throws Exception {
        cleanup();
    }

}
