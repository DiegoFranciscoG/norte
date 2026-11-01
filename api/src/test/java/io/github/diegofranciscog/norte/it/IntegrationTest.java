package io.github.diegofranciscog.norte.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Base de las pruebas de integración: PostgreSQL real en un contenedor (nunca H2), la aplicación completa
 * y MockMvc con la cadena de seguridad. Sin Docker, estas pruebas se omiten (en CI siempre corren).
 */
@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
abstract class IntegrationTest {

    /** Un solo contenedor para todas las clases (se arranca una vez; Testcontainers lo elimina al terminar). */
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18.6-alpine");
    static final JsonMapper JSON = JsonMapper.builder().build();
    static final SecureRandom RANDOM = new SecureRandom();
    static final String JWT_SECRET = randomBase64(48);
    static final String TRIGGER_TOKEN = randomHex(32);
    static final IndexStub INDEX = IndexStub.start();
    private static final AtomicInteger IPS = new AtomicInteger(1);

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        POSTGRES.start();
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("norte.jwt.secret", () -> JWT_SECRET);
        registry.add("norte.alerts.trigger-token", () -> TRIGGER_TOKEN);
        registry.add("norte.cors-allowed-origins", () -> "http://localhost:4200");
        registry.add("norte.index-base-url", INDEX::baseUrl);
        registry.add("norte.site-url", () -> "https://norte.example");
    }

    @Autowired
    WebApplicationContext context;

    @Autowired
    JdbcTemplate jdbc;

    MockMvc mvc;

    /** Cada prueba sale desde una IP distinta para que el límite de intentos de una no afecte a otra. */
    String ip;

    @BeforeEach
    void setUpMockMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(SecurityMockMvcConfigurers.springSecurity()).build();
        int n = IPS.getAndIncrement();
        ip = "10.1." + (n / 250) + "." + (n % 250 + 1);
    }

    static String randomBase64(int bytes) {
        byte[] b = new byte[bytes];
        RANDOM.nextBytes(b);
        return Base64.getEncoder().encodeToString(b);
    }

    static String randomHex(int bytes) {
        byte[] b = new byte[bytes];
        RANDOM.nextBytes(b);
        return HexFormat.of().formatHex(b);
    }

    static String newEmail() {
        return "u" + UUID.randomUUID().toString().replace("-", "") + "@example.com";
    }

    static String newPassword() {
        return "Clave-" + UUID.randomUUID();
    }

    static String json(Object value) {
        return JSON.writeValueAsString(value);
    }

    static JsonNode read(String body) {
        return JSON.readTree(body);
    }

    RequestPostProcessor fromIp() {
        String address = ip;
        return (MockHttpServletRequest request) -> {
            request.setRemoteAddr(address);
            return request;
        };
    }

    MockHttpServletRequestBuilder jsonPost(String url, Object body) {
        return post(url).with(fromIp()).contentType(MediaType.APPLICATION_JSON).content(json(body));
    }

    MockHttpServletRequestBuilder jsonPut(String url, Object body, String token) {
        return put(url).with(fromIp()).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(json(body));
    }

    MockHttpServletRequestBuilder authGet(String url, String token) {
        return get(url).with(fromIp()).header("Authorization", "Bearer " + token);
    }

    String currentVersion(String purpose) throws Exception {
        String body = mvc.perform(get("/api/v1/consent-texts")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        for (JsonNode t : read(body)) {
            if (purpose.equals(t.get("purpose").asString())) {
                return t.get("version").asString();
            }
        }
        throw new IllegalStateException("Sin texto vigente para " + purpose);
    }

    void register(String email, String password, String... grantedPurposes) throws Exception {
        List<Map<String, Object>> consents = new ArrayList<>();
        for (String purpose : grantedPurposes) {
            consents.add(Map.of("purpose", purpose, "granted", true, "textVersion", currentVersion(purpose)));
        }
        mvc.perform(jsonPost("/api/v1/auth/register", Map.of("email", email, "password", password, "consents", consents))).andExpect(status().isCreated());
    }

    JsonNode login(String email, String password) throws Exception {
        String body = mvc.perform(jsonPost("/api/v1/auth/login", Map.of("email", email, "password", password))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return read(body);
    }

    /** Registra y devuelve el token de acceso. */
    String signUp(String email, String password, String... grantedPurposes) throws Exception {
        register(email, password, grantedPurposes);
        return login(email, password).get("accessToken").asString();
    }

    UUID userId(String email) {
        return jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email);
    }
}
