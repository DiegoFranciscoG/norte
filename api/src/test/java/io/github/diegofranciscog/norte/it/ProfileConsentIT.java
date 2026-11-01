package io.github.diegofranciscog.norte.it;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Sin consentimiento no se guarda nada; al retirarlo, se borra lo guardado para esa finalidad. */
class ProfileConsentIT extends IntegrationTest {

    static Map<String, Object> profile() {
        return Map.of("homeCity", "Cuenca", "acceptsRelocation", true, "yearsOfExperience", 2.5, "englishLevel", "B2", "minSalaryUsd", 1200);
    }

    static List<Map<String, Object>> skills() {
        return List.of(Map.of("skillId", "java", "origin", "DEMONSTRATED", "repos", List.of("api-ventas")), Map.of("skillId", "docker", "origin", "DECLARED"));
    }

    @Test
    void sinConsentimientoNoSeGuardaElPerfil() throws Exception {
        String token = signUp(newEmail(), newPassword());
        mvc.perform(jsonPut("/api/v1/me/profile", profile(), token)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("consent-required"));
        mvc.perform(jsonPut("/api/v1/me/skills", skills(), token)).andExpect(status().isForbidden());
        mvc.perform(jsonPut("/api/v1/me/alerts", Map.of("enabled", true, "minScore", 70), token)).andExpect(status().isForbidden());
    }

    @Test
    void consentirGuardarYRetirarBorra() throws Exception {
        String token = signUp(newEmail(), newPassword());
        String version = currentVersion("PROFILE_STORAGE");

        mvc.perform(jsonPut("/api/v1/me/consents/PROFILE_STORAGE", Map.of("granted", true, "textVersion", "1999-01"), token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("consent-version"));
        mvc.perform(jsonPut("/api/v1/me/consents/PROFILE_STORAGE", Map.of("granted", true, "textVersion", version), token)).andExpect(status().isNoContent());

        mvc.perform(jsonPut("/api/v1/me/profile", profile(), token)).andExpect(status().isOk()).andExpect(jsonPath("$.englishLevel").value("B2"));
        mvc.perform(jsonPut("/api/v1/me/skills", skills(), token)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));

        mvc.perform(jsonPut("/api/v1/me/consents/PROFILE_STORAGE", Map.of("granted", false, "textVersion", version), token)).andExpect(status().isNoContent());
        mvc.perform(authGet("/api/v1/me/skills", token)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(authGet("/api/v1/me/profile", token)).andExpect(status().isOk()).andExpect(jsonPath("$.englishLevel").doesNotExist());
    }

    @Test
    void rechazaHabilidadesConFormatoInvalido() throws Exception {
        String token = signUp(newEmail(), newPassword(), "PROFILE_STORAGE");
        mvc.perform(jsonPut("/api/v1/me/skills", List.of(Map.of("skillId", "DROP TABLE users;", "origin", "DECLARED")), token)).andExpect(status().isBadRequest());
        mvc.perform(jsonPut("/api/v1/me/profile", Map.of("homeCity", "Cuenca", "englishLevel", "Z9"), token)).andExpect(status().isBadRequest());
    }
}
