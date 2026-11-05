package io.github.diegofranciscog.norte.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** Configuración de NORTE. Se valida al arrancar: si falta algo crítico, la aplicación no inicia. */
@Validated
@ConfigurationProperties(prefix = "norte")
public record NorteProperties(
        @Valid @NotNull Jwt jwt,
        @NotEmpty List<String> corsAllowedOrigins,
        @Valid @NotNull Alerts alerts,
        @NotBlank String indexBaseUrl,
        @NotBlank String siteUrl,
        @Valid @NotNull RateLimit rateLimit) {

    public record Jwt(@NotBlank String secret, @NotBlank String issuer, @NotNull Duration accessTtl, @NotNull Duration refreshTtl) {
    }

    public record Alerts(@NotBlank String triggerToken, @NotBlank String from, @Min(1) @Max(50) int maxJobsPerEmail, @Min(1) int lookbackHoursFirstRun) {
    }

    public record RateLimit(@Min(1) int maxAttempts, @Min(1) int maxAttemptsPerIp, @NotNull Duration window, String clientIpHeader) {
    }
}
