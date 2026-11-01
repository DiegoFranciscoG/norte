package io.github.diegofranciscog.norte.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.diegofranciscog.norte.config.NorteProperties;
import io.github.diegofranciscog.norte.service.TokenService;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

class JwtConfigTest {

    private static final SecureRandom RANDOM = new SecureRandom();
    private final JwtConfig config = new JwtConfig();

    /** Secretos generados en cada ejecución: ninguno queda escrito en el repositorio. */
    static String randomBase64(int bytes) {
        byte[] b = new byte[bytes];
        RANDOM.nextBytes(b);
        return Base64.getEncoder().encodeToString(b);
    }

    static NorteProperties props(String secret, String issuer) {
        byte[] token = new byte[32];
        RANDOM.nextBytes(token);
        return new NorteProperties(new NorteProperties.Jwt(secret, issuer, Duration.ofMinutes(15), Duration.ofDays(7)), List.of("http://localhost:4200"),
                new NorteProperties.Alerts(HexFormat.of().formatHex(token), "alertas@norte.test", 10, 72), "http://localhost:8080/data/v1", "http://localhost:4200",
                "Cuenca", new NorteProperties.RateLimit(5, Duration.ofMinutes(15)));
    }

    @Test
    void rechazaSecretosDeMenosDe256Bits() {
        assertThatThrownBy(() -> JwtConfig.secretKey(randomBase64(16))).isInstanceOf(IllegalStateException.class).hasMessageContaining("256 bits");
        assertThatThrownBy(() -> JwtConfig.secretKey("-".repeat(20))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aceptaBase64OTextoLargo() {
        assertThat(JwtConfig.secretKey(randomBase64(48)).getEncoded()).hasSize(48);
        assertThat(JwtConfig.secretKey("-".repeat(40)).getEncoded()).hasSize(40);
    }

    @Test
    void elTokenDeAccesoEsCortoYSoloLoValidaQuienTieneLaClave() {
        NorteProperties props = props(randomBase64(48), "norte-api");
        SecretKey key = config.jwtKey(props);
        TokenService tokens = new TokenService(config.jwtEncoder(key), props);
        UUID user = UUID.randomUUID();

        String token = tokens.accessToken(user);
        Jwt jwt = config.jwtDecoder(key, props).decode(token);
        assertThat(jwt.getSubject()).isEqualTo(user.toString());
        assertThat(Duration.between(Instant.now(), jwt.getExpiresAt())).isLessThanOrEqualTo(Duration.ofMinutes(15));

        NorteProperties other = props(randomBase64(48), "norte-api");
        JwtDecoder foreign = config.jwtDecoder(config.jwtKey(other), other);
        assertThatThrownBy(() -> foreign.decode(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void rechazaTokensDeOtroEmisor() {
        String secret = randomBase64(48);
        NorteProperties mine = props(secret, "norte-api");
        NorteProperties impostor = props(secret, "otro-emisor");
        String token = new TokenService(config.jwtEncoder(config.jwtKey(impostor)), impostor).accessToken(UUID.randomUUID());
        assertThatThrownBy(() -> config.jwtDecoder(config.jwtKey(mine), mine).decode(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void elTokenDelDisparoDeAlertasDebeSerLargo() {
        assertThatThrownBy(() -> new AlertTriggerTokenFilter("corto")).isInstanceOf(IllegalStateException.class);
    }
}
