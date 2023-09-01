package com.github.lonelylockley.archinsight;

import com.nimbusds.jose.Algorithm;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.KeyUse;

import java.io.FileOutputStream;
import java.io.FileWriter;
import java.nio.file.Paths;
import java.security.*;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Date;

import static com.nimbusds.jose.jwk.Curve.P_256;

public class KeyGenerator {

    public static final Algorithm ALGORITHM = Algorithm.parse("ES256");
    public static final Curve CURVE = P_256;

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

        ECGenParameterSpec ecSpec = new ECGenParameterSpec(CURVE.getStdName());
        KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
        g.initialize(ecSpec, new SecureRandom());
        KeyPair keypair = g.generateKeyPair();
        var publicKey = (ECPublicKey) keypair.getPublic();
        var privateKey = (ECPrivateKey) keypair.getPrivate();
        var now = new Date();
        var jwk = new ECKey.Builder(CURVE, publicKey)
                .privateKey(privateKey)
                .keyID(kid)
                .keyUse(KeyUse.SIGNATURE)
                .algorithm(ALGORITHM)
                .issueTime(now)
                .notBeforeTime(now)
                .build();
        writeFile(path, kid, jwk.toString());
    }

    private static void writeFile(String baseP, String filename, String content) throws Exception {
        var base = Paths.get(baseP);
        assert base.toFile().exists();
        assert base.toFile().canWrite();
        var dest = base.resolve(Paths.get(filename + "_key.jwk"));
        try (var fw = new FileWriter(dest.toFile())) {
            fw.write(content);
            fw.flush();
        }
    }
}
