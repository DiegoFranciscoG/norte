package io.github.diegofranciscog.norte.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** T-09: borrar la cuenta borra de verdad. Ninguna tabla conserva filas de esa persona. */
class AccountDeletionIT extends IntegrationTest {

    private List<String> tablesWithUserId() {
        return jdbc.queryForList("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'user_id' ORDER BY table_name",
                String.class);
    }

    private int rows(String table, UUID userId) {
        // El nombre de la tabla viene del catálogo de la base, no de una entrada externa.
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE user_id = ?", Integer.class, userId);
    }

    private String fullAccount(String email, String password) throws Exception {
        String token = signUp(email, password, "PROFILE_STORAGE", "EMAIL_ALERTS");
        mvc.perform(jsonPut("/api/v1/me/profile", ProfileConsentIT.profile(), token)).andExpect(status().isOk());
        mvc.perform(jsonPut("/api/v1/me/skills", ProfileConsentIT.skills(), token)).andExpect(status().isOk());
        mvc.perform(jsonPut("/api/v1/me/repos", List.of(Map.of("name", "api-ventas", "url", "https://github.com/ejemplo/api-ventas", "skills", List.of("java"))), token))
                .andExpect(status().isOk());
        mvc.perform(jsonPut("/api/v1/me/alerts", Map.of("enabled", true, "minScore", 65), token)).andExpect(status().isOk());
        String app = mvc.perform(jsonPost("/api/v1/me/applications", ApplicationsIT.application("APPLIED")).header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertThat(read(app).get("history").size()).isEqualTo(2);
        return token;
    }

    @Test
    void exportaTodoLoQueGuardaDeLaPersona() throws Exception {
        String email = newEmail();
        String token = fullAccount(email, newPassword());
        mvc.perform(authGet("/api/v1/me/export", token))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("attachment")))
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.skills.length()").value(2))
                .andExpect(jsonPath("$.repos.length()").value(1))
                .andExpect(jsonPath("$.applications.length()").value(1))
                .andExpect(jsonPath("$.consents.length()").value(2))
                .andExpect(jsonPath("$.alerts.enabled").value(true))
                .andExpect(jsonPath("$.audit").isArray());
    }

    @Test
    void t09BorrarLaCuentaNoDejaNingunaFila() throws Exception {
        String email = newEmail();
        String password = newPassword();
        String token = fullAccount(email, password);
        String refresh = login(email, password).get("refreshToken").asString();
        UUID id = userId(email);
        UUID applicationId = jdbc.queryForObject("SELECT id FROM applications WHERE user_id = ?", UUID.class, id);

        List<String> tables = tablesWithUserId();
        assertThat(tables).contains("refresh_tokens", "consents", "profiles", "profile_skills", "analyzed_repos", "applications", "alerts", "audit_log");
        for (String table : tables) {
            assertThat(rows(table, id)).as("antes del borrado, %s tiene datos", table).isPositive();
        }

        mvc.perform(delete("/api/v1/me").with(fromIp()).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("password", newPassword())))).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE id = ?", Integer.class, id)).isEqualTo(1);

        mvc.perform(delete("/api/v1/me").with(fromIp()).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("password", password)))).andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE id = ?", Integer.class, id)).isZero();
        for (String table : tables) {
            assertThat(rows(table, id)).as("después del borrado, %s no conserva filas", table).isZero();
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM application_events WHERE application_id = ?", Integer.class, applicationId)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE action = 'ACCOUNT_DELETED' AND user_id IS NULL", Integer.class)).isPositive();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE detail ILIKE ?", Integer.class, "%" + email + "%")).isZero();

        mvc.perform(authGet("/api/v1/me/profile", token)).andExpect(status().isUnauthorized());
        mvc.perform(jsonPost("/api/v1/auth/refresh", Map.of("refreshToken", refresh))).andExpect(status().isUnauthorized());
        mvc.perform(jsonPost("/api/v1/auth/login", Map.of("email", email, "password", password))).andExpect(status().isUnauthorized());
    }
}
