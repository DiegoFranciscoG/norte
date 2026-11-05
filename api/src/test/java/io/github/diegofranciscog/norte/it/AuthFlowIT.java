package io.github.diegofranciscog.norte.it;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class AuthFlowIT extends IntegrationTest {

    @Test
    void registroInicioYCorreoRepetido() throws Exception {
        String email = newEmail();
        String password = newPassword();
        register(email, password);

        mvc.perform(jsonPost("/api/v1/auth/register", Map.of("email", email.toUpperCase(), "password", newPassword())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("email-taken"));

        JsonNode tokens = login(email, password);
        org.assertj.core.api.Assertions.assertThat(tokens.get("expiresIn").asInt()).isLessThanOrEqualTo(15 * 60);

        mvc.perform(jsonPost("/api/v1/auth/login", Map.of("email", email, "password", newPassword())))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("unauthorized"));
    }

    @Test
    void losConsentimientosNoVienenMarcadosPorDefecto() throws Exception {
        String token = signUp(newEmail(), newPassword());
        mvc.perform(authGet("/api/v1/me/consents", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].granted").value(false))
                .andExpect(jsonPath("$[1].granted").value(false));
    }

    @Test
    void elRefrescoRotaYSiSeReutilizaUnTokenSeRevocaToda() throws Exception {
        String email = newEmail();
        String password = newPassword();
        register(email, password);
        String first = login(email, password).get("refreshToken").asString();

        String body = mvc.perform(jsonPost("/api/v1/auth/refresh", Map.of("refreshToken", first))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String second = read(body).get("refreshToken").asString();

        mvc.perform(jsonPost("/api/v1/auth/refresh", Map.of("refreshToken", first))).andExpect(status().isUnauthorized());
        mvc.perform(jsonPost("/api/v1/auth/refresh", Map.of("refreshToken", second))).andExpect(status().isUnauthorized());
    }

    @Test
    void cerrarSesionInvalidaElRefresco() throws Exception {
        String email = newEmail();
        String password = newPassword();
        register(email, password);
        String refresh = login(email, password).get("refreshToken").asString();

        mvc.perform(jsonPost("/api/v1/auth/logout", Map.of("refreshToken", refresh))).andExpect(status().isNoContent());
        mvc.perform(jsonPost("/api/v1/auth/refresh", Map.of("refreshToken", refresh))).andExpect(status().isUnauthorized());
    }

    @Test
    void frenaLaFuerzaBrutaConUn429() throws Exception {
        String email = newEmail();
        for (int i = 0; i < 5; i++) {
            mvc.perform(jsonPost("/api/v1/auth/login", Map.of("email", email, "password", newPassword()))).andExpect(status().isUnauthorized());
        }
        mvc.perform(jsonPost("/api/v1/auth/login", Map.of("email", email, "password", newPassword())))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.code").value("too-many-attempts"));
    }

    @Test
    void limitaLasCuentasNuevasDesdeUnaMismaIp() throws Exception {
        for (int i = 0; i < 20; i++) {
            register(newEmail(), newPassword());
        }
        mvc.perform(jsonPost("/api/v1/auth/register", Map.of("email", newEmail(), "password", newPassword())))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void validaLosDatosDeEntrada() throws Exception {
        mvc.perform(jsonPost("/api/v1/auth/register", Map.of("email", "no-es-correo", "password", "corta")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation"))
                .andExpect(jsonPath("$.errors[*].field", org.hamcrest.Matchers.hasItems("email", "password")));
    }
}
