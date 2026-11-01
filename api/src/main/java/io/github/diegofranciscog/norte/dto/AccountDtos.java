package io.github.diegofranciscog.norte.dto;

import io.github.diegofranciscog.norte.domain.Enums.ConsentPurpose;
import io.github.diegofranciscog.norte.dto.ApplicationDtos.ApplicationResponse;
import io.github.diegofranciscog.norte.dto.ProfileDtos.ProfileResponse;
import io.github.diegofranciscog.norte.dto.ProfileDtos.RepoItem;
import io.github.diegofranciscog.norte.dto.ProfileDtos.SkillItem;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public final class AccountDtos {

    private AccountDtos() {
    }

    public record ConsentTextResponse(ConsentPurpose purpose, String version, String text) {
    }

    public record ConsentStateResponse(ConsentPurpose purpose, boolean granted, String textVersion, Instant grantedAt) {
    }

    public record ConsentUpdateRequest(boolean granted, @NotBlank @Size(max = 20) String textVersion) {
    }

    public record AlertSettings(boolean enabled, @Min(0) @Max(100) int minScore) {
    }

    public record DeleteAccountRequest(@NotBlank @Size(max = 128) String password) {
    }

    public record AlertRunSummary(String indexVersion, int usersChecked, int emailsSent, int jobsConsidered) {
    }

    public record ConsentRecord(ConsentPurpose purpose, String textVersion, boolean granted, Instant decidedAt) {
    }

    public record AuditRecord(String action, Instant at, String detail) {
    }

    /** Todo lo que el servidor guarda de una persona, en un solo archivo (acceso y portabilidad, LOPDP). */
    public record ExportResponse(
            Instant exportedAt,
            String email,
            Instant accountCreatedAt,
            ProfileResponse profile,
            List<SkillItem> skills,
            List<RepoItem> repos,
            List<ApplicationResponse> applications,
            AlertSettings alerts,
            List<ConsentRecord> consents,
            List<AuditRecord> audit) {
    }
}
