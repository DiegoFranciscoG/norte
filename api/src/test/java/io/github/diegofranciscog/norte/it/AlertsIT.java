package io.github.diegofranciscog.norte.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.diegofranciscog.norte.service.AlertMailer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

/** Alertas: solo con consentimiento, solo vacantes nuevas sobre el umbral y solo de fuentes que lo permiten. */
class AlertsIT extends IntegrationTest {

    @MockitoBean
    AlertMailer mailer;

    private static Map<String, Object> job(String id, String title, String sourceId, String sourceName, boolean allowInAlerts) {
        String now = Instant.now().toString();
        return Map.ofEntries(
                Map.entry("id", id),
                Map.entry("title", title),
                Map.entry("company", Map.of("name", "Ficticia S.A.")),
                Map.entry("location", Map.of("city", "Cuenca", "country", "EC")),
                Map.entry("modality", "hybrid"),
                Map.entry("seniority", "mid"),
                Map.entry("yearsRequired", 2),
                Map.entry("skills", List.of(Map.of("id", "java", "optional", false), Map.of("id", "docker", "optional", true))),
                Map.entry("languages", List.of()),
                Map.entry("publishedAt", now),
                Map.entry("firstSeenAt", now),
                Map.entry("status", "open"),
                Map.entry("sources", List.of(Map.of("sourceId", sourceId, "sourceName", sourceName, "url", "https://example.com/" + id, "allowInAlerts", allowInAlerts))));
    }

    private static void publishIndex(String version) throws Exception {
        INDEX.put("index.json", json(Map.of("build", Map.of("version", version, "generatedAt", Instant.now().toString()), "home", Map.of("city", "Cuenca", "country", "EC"))));
        INDEX.put("jobs.json", json(Map.of("jobs", List.of(
                job("j_ok", "Desarrollador Java", "greenhouse", "Greenhouse", true),
                job("j_prohibida", "Desarrollador Java remoto", "remotive", "Remotive", false)))));
        INDEX.put("skills.json", Files.readString(Path.of("..", "data", "skills", "catalog.json")));
        INDEX.put("scoring.json", Files.readString(Path.of("..", "data", "config", "scoring.json")));
        INDEX.put("geo.json", Files.readString(Path.of("..", "data", "geo", "geo.json")));
    }

    @Test
    @SuppressWarnings("unchecked")
    void enviaSoloLoNuevoYPermitidoUnaVezPorIndice() throws Exception {
        String email = newEmail();
        String token = signUp(email, newPassword(), "PROFILE_STORAGE", "EMAIL_ALERTS");
        mvc.perform(jsonPut("/api/v1/me/profile", Map.of("homeCountry", "EC", "homeCity", "Cuenca", "acceptsRelocation", false, "yearsOfExperience", 3, "englishLevel", "B2"), token))
                .andExpect(status().isOk());
        mvc.perform(jsonPut("/api/v1/me/skills", List.of(Map.of("skillId", "java", "origin", "DEMONSTRATED")), token)).andExpect(status().isOk());
        mvc.perform(jsonPut("/api/v1/me/alerts", Map.of("enabled", true, "minScore", 50), token)).andExpect(status().isOk());

        String quiet = signUp(newEmail(), newPassword(), "PROFILE_STORAGE");
        mvc.perform(jsonPut("/api/v1/me/skills", List.of(Map.of("skillId", "java", "origin", "DEMONSTRATED")), quiet)).andExpect(status().isOk());

        publishIndex("prueba-" + randomHex(4));
        String body = mvc.perform(post("/api/internal/alerts/run").header("Authorization", "Bearer " + TRIGGER_TOKEN)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode summary = read(body);
        assertThat(summary.get("emailsSent").asInt()).isGreaterThanOrEqualTo(1);

        ArgumentCaptor<List<AlertMailer.Item>> items = ArgumentCaptor.forClass(List.class);
        verify(mailer).send(eq(email), items.capture());
        assertThat(items.getValue()).extracting(AlertMailer.Item::sourceName).containsExactly("Greenhouse");
        assertThat(items.getValue().getFirst().score()).isGreaterThanOrEqualTo(50);
        assertThat(items.getValue().getFirst().jobUrl()).isEqualTo("https://norte.example/vacante/j_ok");

        mvc.perform(post("/api/internal/alerts/run").header("Authorization", "Bearer " + TRIGGER_TOKEN)).andExpect(status().isOk());
        verify(mailer).send(eq(email), anyList());

        mvc.perform(jsonPut("/api/v1/me/consents/EMAIL_ALERTS", Map.of("granted", false, "textVersion", currentVersion("EMAIL_ALERTS")), token))
                .andExpect(status().isNoContent());
        publishIndex("prueba-" + randomHex(4));
        mvc.perform(post("/api/internal/alerts/run").header("Authorization", "Bearer " + TRIGGER_TOKEN)).andExpect(status().isOk());
        verify(mailer).send(eq(email), anyList());
    }
}
