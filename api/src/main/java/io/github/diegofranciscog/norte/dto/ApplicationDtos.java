package io.github.diegofranciscog.norte.dto;

import io.github.diegofranciscog.norte.domain.Enums.ApplicationStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ApplicationDtos {

    private ApplicationDtos() {
    }

    public record ApplicationRequest(
            @NotBlank @Size(max = 40) @Pattern(regexp = "[A-Za-z0-9_-]+") String jobId,
            @NotBlank @Size(max = 300) String jobTitle,
            @NotBlank @Size(max = 200) String company,
            @Size(max = 1000) @Pattern(regexp = "https?://.+") String jobUrl,
            ApplicationStatus status,
            LocalDate appliedAt,
            LocalDate followUpAt,
            @Size(max = 4000) String notes) {
    }

    public record StatusChange(ApplicationStatus status, Instant changedAt) {
    }

    public record ApplicationResponse(
            UUID id,
            String jobId,
            String jobTitle,
            String company,
            String jobUrl,
            ApplicationStatus status,
            LocalDate appliedAt,
            LocalDate followUpAt,
            String notes,
            Instant createdAt,
            Instant updatedAt,
            List<StatusChange> history) {
    }
}
