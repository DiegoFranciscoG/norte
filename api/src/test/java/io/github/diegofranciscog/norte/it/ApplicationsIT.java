package io.github.diegofranciscog.norte.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class ApplicationsIT extends IntegrationTest {

    static Map<String, Object> application(String status) {
        Map<String, Object> m = new HashMap<>(Map.of("jobId", "j_abc123", "jobTitle", "Desarrollador Java", "company", "Ficticia S.A.",
                "jobUrl", "https://boards.greenhouse.io/ficticia/jobs/1"));
        if (status != null) {
            m.put("status", status);
        }
        return m;
    }

    @Test
    void guardarPostularYVerElHistorial() throws Exception {
        String token = signUp(newEmail(), newPassword());
        String body = mvc.perform(jsonPost("/api/v1/me/applications", application(null)).header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SAVED"))
                .andReturn().getResponse().getContentAsString();
        String id = read(body).get("id").asString();

        mvc.perform(jsonPost("/api/v1/me/applications", application(null)).header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("already-saved"));

        mvc.perform(jsonPut("/api/v1/me/applications/" + id, application("APPLIED"), token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPLIED"))
                .andExpect(jsonPath("$.appliedAt").exists())
                .andExpect(jsonPath("$.history.length()").value(2));

        mvc.perform(delete("/api/v1/me/applications/" + id).with(fromIp()).header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        mvc.perform(authGet("/api/v1/me/applications", token)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void nadieVeNiTocaLasPostulacionesDeOtraPersona() throws Exception {
        String owner = signUp(newEmail(), newPassword());
        String intruder = signUp(newEmail(), newPassword());
        String body = mvc.perform(jsonPost("/api/v1/me/applications", application(null)).header("Authorization", "Bearer " + owner))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = read(body).get("id").asString();

        mvc.perform(authGet("/api/v1/me/applications", intruder)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(jsonPut("/api/v1/me/applications/" + id, application("REJECTED"), intruder)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/me/applications/" + id).with(fromIp()).header("Authorization", "Bearer " + intruder).contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
        mvc.perform(authGet("/api/v1/me/applications", owner)).andExpect(jsonPath("$[0].status").value("SAVED"));
    }
}
