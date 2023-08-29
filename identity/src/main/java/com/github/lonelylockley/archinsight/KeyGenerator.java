package com.github.lonelylockley.archinsight;

import java.io.FileOutputStream;
import java.nio.file.Paths;
import java.security.*;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;

public class KeyGenerator {

    public static final String ALGORITHM = "EC";
    public static final String CURVE = "secp256r1";

    public static void main(String... args) throws Exception {
        String kid = null;
        String path = null;

        if (args.length == 2) {
            kid = args[0];
            path = args[1];
        }
        else {
            System.out.println("Usage: java -cp app.jar com.github.lonelylockley.archinsight.KeyGenerator KEY_ID SAVE_PATH");
            System.exit(1);
        }

        ECGenParameterSpec ecSpec = new ECGenParameterSpec(CURVE);
        KeyPairGenerator g = KeyPairGenerator.getInstance(ALGORITHM);
        g.initialize(ecSpec, new SecureRandom());
        KeyPair keypair = g.generateKeyPair();
        var publicKey = (ECPublicKey) keypair.getPublic();
        var privateKey = (ECPrivateKey) keypair.getPrivate();
        writeFile(path, kid, true, publicKey.getEncoded());
        writeFile(path, kid, false, privateKey.getEncoded());
    }

    private static void writeFile(String baseP, String filename, boolean pub, byte[] content) throws Exception {
        var base = Paths.get(baseP);
        assert base.toFile().exists();
        assert base.toFile().canWrite();
        var dest = base.resolve(Paths.get(filename + (pub ? "_public.key" : "_private.key")));
        var outputStream = new FileOutputStream(dest.toFile());
        outputStream.write(content);
        outputStream.flush();
        outputStream.close();
    }
}
