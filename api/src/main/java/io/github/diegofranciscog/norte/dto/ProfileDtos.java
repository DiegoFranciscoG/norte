package io.github.diegofranciscog.norte.dto;

import io.github.diegofranciscog.norte.domain.Enums.SkillOrigin;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class ProfileDtos {

    private ProfileDtos() {
    }

    public record ProfileRequest(
            @NotBlank @Size(max = 80) String homeCity,
            boolean acceptsRelocation,
            @DecimalMin("0") @DecimalMax("50") BigDecimal yearsOfExperience,
            @Pattern(regexp = "A1|A2|B1|B2|C1|C2") String englishLevel,
            @Min(0) @Max(1_000_000) Integer minSalaryUsd,
            @Size(max = 7) Map<@Pattern(regexp = "demonstrated|declared|experience|location|language|compensation|freshness") String, @NotNull @Min(0) @Max(100) Integer> weights,
            @Pattern(regexp = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})") String githubUser) {
    }

    public record ProfileResponse(
            String homeCity,
            boolean acceptsRelocation,
            BigDecimal yearsOfExperience,
            String englishLevel,
            Integer minSalaryUsd,
            Map<String, Integer> weights,
            String githubUser,
            Instant updatedAt) {
    }

    /** Solo el identificador del catálogo y su URI ESCO: nunca texto del CV. */
    public record SkillItem(
            @NotBlank @Pattern(regexp = "[a-z0-9.+#-]{1,60}") String skillId,
            @Size(max = 200) @Pattern(regexp = "http://data\\.europa\\.eu/esco/skill/[0-9a-f-]{36}") String escoUri,
            @NotNull SkillOrigin origin,
            @Size(max = 20) List<@NotBlank @Size(max = 100) String> repos) {
    }

    public record RepoItem(
            @NotBlank @Size(max = 100) String name,
            @NotBlank @Size(max = 300) @Pattern(regexp = "https://github\\.com/.+") String url,
            Instant pushedAt,
            @Size(max = 200) List<@NotBlank @Size(max = 60) String> skills) {
    }
}
