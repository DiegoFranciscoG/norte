package io.github.diegofranciscog.norte.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** Deny-by-default, cabeceras, actuator mínimo, CORS explícito y errores sin detalles internos. */
class SecurityIT extends IntegrationTest {

    @Test
    void sinTokenNoHayAccesoANingunDatoPersonal() throws Exception {
        mvc.perform(get("/api/v1/me/profile")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me/applications")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me/export")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/v1/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/cualquier-cosa")).andExpect(status().isUnauthorized());
    }

    @Test
    void unTokenFalsoNoSirve() throws Exception {
        mvc.perform(get("/api/v1/me/profile").header("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.e30.firma-falsa")).andExpect(status().isUnauthorized());
    }

    @Test
    void actuatorSoloExponeHealthSinDetalles() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP")).andExpect(jsonPath("$.components").doesNotExist());
        mvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/heapdump")).andExpect(status().isUnauthorized());
    }

    @Test
    void respondeConCabecerasDeSeguridad() throws Exception {
        mvc.perform(get("/api/v1/consent-texts"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("Content-Security-Policy", org.hamcrest.Matchers.containsString("default-src 'none'")));
    }

    @Test
    void elDisparoDeAlertasExigeElSecretoCompartido() throws Exception {
        mvc.perform(post("/api/internal/alerts/run")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/internal/alerts/run").header("Authorization", "Bearer " + randomHex(32))).andExpect(status().isUnauthorized());
    }

    @Test
    void corsSoloParaLosOrigenesConfigurados() throws Exception {
        mvc.perform(options("/api/v1/auth/login").header("Origin", "http://localhost:4200").header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:4200"));
        mvc.perform(options("/api/v1/auth/login").header("Origin", "https://malicioso.example").header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }

    @Test
    void losErroresNoMuestranTrazasNiClasesInternas() throws Exception {
        String body = mvc.perform(post("/api/v1/auth/login").with(fromIp()).contentType(MediaType.APPLICATION_JSON).content("{\"email\":"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("malformed"))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("Exception", "at io.", "at org.", "trace");
    }
}
