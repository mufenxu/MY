import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.interfaces.RSAPublicKey;
import java.util.Arrays;
import java.util.Base64;

/** Signs release metadata with the dedicated APK key; credentials are read only from the environment. */
public final class SignAndroidManifest {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("Expected the generated manifest path.");
        char[] storePassword = required("RELEASE_STORE_PASSWORD").toCharArray();
        char[] keyPassword = required("RELEASE_KEY_PASSWORD").toCharArray();
        try {
            Path path = Path.of(args[0]);
            byte[] payload = Files.readAllBytes(path);
            if (payload.length == 0 || payload.length > 128 * 1024) throw new IllegalArgumentException("Invalid manifest size.");
            String json = new String(payload, StandardCharsets.UTF_8).strip();
            if (!json.startsWith("{") || !json.endsWith("}")) throw new IllegalArgumentException("Expected a JSON manifest.");
            KeyStore store = KeyStore.getInstance(Path.of(required("RELEASE_KEYSTORE_PATH")).toFile(), storePassword);
            String alias = required("RELEASE_KEY_ALIAS");
            PrivateKey key = (PrivateKey) store.getKey(alias, keyPassword);
            var publicKey = store.getCertificate(alias).getPublicKey();
            String algorithm;
            if (publicKey instanceof RSAPublicKey rsa && rsa.getModulus().bitLength() >= 2048) algorithm = "SHA256withRSA";
            else if (publicKey instanceof ECPublicKey ec && ec.getParams().getCurve().getField().getFieldSize() >= 256) algorithm = "SHA256withECDSA";
            else throw new IllegalArgumentException("Unsupported release signing key.");
            byte[] context = "MY-ANDROID-UPDATE-V1\n".getBytes(StandardCharsets.US_ASCII);
            Signature signer = Signature.getInstance(algorithm);
            signer.initSign(key);
            signer.update(context);
            signer.update(payload);
            byte[] signature = signer.sign();
            signer.initVerify(publicKey);
            signer.update(context);
            signer.update(payload);
            if (!signer.verify(signature)) throw new IllegalStateException("Manifest signature verification failed.");
            var encoder = Base64.getUrlEncoder().withoutPadding();
            String signed = json.substring(0, json.length() - 1).stripTrailing()
                + ",\n  \"signedPayload\": \"" + encoder.encodeToString(payload)
                + "\",\n  \"signatureAlgorithm\": \"" + algorithm
                + "\",\n  \"signature\": \"" + encoder.encodeToString(signature) + "\"\n}\n";
            Files.writeString(path, signed, StandardCharsets.UTF_8);
        } finally {
            Arrays.fill(storePassword, '\0');
            Arrays.fill(keyPassword, '\0');
        }
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing signing environment: " + name);
        return value;
    }
}
