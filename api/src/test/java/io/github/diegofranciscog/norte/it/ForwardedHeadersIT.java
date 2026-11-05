package io.github.diegofranciscog.norte.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;

/** Con el servidor real, como detrás del proxy de Render: quien conecta está en una red privada y reenvía la IP y el esquema. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ForwardedHeadersIT extends IntegrationTest {

    private final HttpClient http = HttpClient.newHttpClient();

    @Value("${local.server.port}")
    int port;

    private URI url(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    private int failedLoginFrom(String visitorIp) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(url("/api/v1/auth/login"))
                .header("Content-Type", "application/json")
                .header("X-Forwarded-For", visitorIp)
                .POST(HttpRequest.BodyPublishers.ofString(json(Map.of("email", newEmail(), "password", newPassword()))))
                .build();
        return http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    @Test
    void cuentaLosIntentosPorLaIpDelVisitanteNoPorLaDelProxy() throws Exception {
        for (int i = 0; i < 20; i++) {
            assertThat(failedLoginFrom("203.0.113.10")).isEqualTo(401);
        }
        assertThat(failedLoginFrom("203.0.113.10")).isEqualTo(429);
        assertThat(failedLoginFrom("203.0.113.11")).isEqualTo(401);
    }

    @Test
    void enviaHstsSoloSiElProxyRecibioHttps() throws Exception {
        HttpRequest overHttps = HttpRequest.newBuilder(url("/actuator/health")).header("X-Forwarded-Proto", "https").build();
        HttpRequest overHttp = HttpRequest.newBuilder(url("/actuator/health")).build();
        assertThat(http.send(overHttps, HttpResponse.BodyHandlers.discarding()).headers().firstValue("Strict-Transport-Security")).isPresent();
        assertThat(http.send(overHttp, HttpResponse.BodyHandlers.discarding()).headers().firstValue("Strict-Transport-Security")).isEmpty();
    }
}
