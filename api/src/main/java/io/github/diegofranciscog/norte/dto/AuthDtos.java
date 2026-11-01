package io.github.diegofranciscog.norte.dto;

import io.github.diegofranciscog.norte.domain.Enums.ConsentPurpose;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 12, max = 128) String password,
            @Valid @Size(max = 10) List<ConsentDecision> consents) {
    }

    /** Casilla separada por finalidad: si no viene, cuenta como no aceptada. */
    public record ConsentDecision(@NotNull ConsentPurpose purpose, boolean granted, @NotBlank @Size(max = 20) String textVersion) {
    }

    public record LoginRequest(@NotBlank @Email @Size(max = 254) String email, @NotBlank @Size(max = 128) String password) {
    }

    public record RefreshRequest(@NotBlank @Size(max = 200) String refreshToken) {
    }

    public record TokenResponse(String accessToken, long expiresIn, String refreshToken, String email) {
    }
}
