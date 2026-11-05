package io.github.diegofranciscog.norte.controller;

import io.github.diegofranciscog.norte.dto.AccountDtos.ConsentTextResponse;
import io.github.diegofranciscog.norte.dto.AuthDtos.LoginRequest;
import io.github.diegofranciscog.norte.dto.AuthDtos.RefreshRequest;
import io.github.diegofranciscog.norte.dto.AuthDtos.RegisterRequest;
import io.github.diegofranciscog.norte.dto.AuthDtos.TokenResponse;
import io.github.diegofranciscog.norte.security.ClientIpResolver;
import io.github.diegofranciscog.norte.service.AuthService;
import io.github.diegofranciscog.norte.service.ConsentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Autenticación", description = "Registro, inicio de sesión y tokens")
public class AuthController {

    private final AuthService auth;
    private final ConsentService consents;
    private final ClientIpResolver clientIp;

    public AuthController(AuthService auth, ConsentService consents, ClientIpResolver clientIp) {
        this.auth = auth;
        this.consents = consents;
        this.clientIp = clientIp;
    }

    @PostMapping("/api/v1/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Crear cuenta con consentimientos opcionales y separados por finalidad")
    public void register(@Valid @RequestBody RegisterRequest req, HttpServletRequest http) {
        auth.register(req, clientIp.resolve(http));
    }

    @PostMapping("/api/v1/auth/login")
    @Operation(summary = "Iniciar sesión: token de acceso corto y token de refresco rotativo")
    public TokenResponse login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        return auth.login(req.email(), req.password(), clientIp.resolve(http));
    }

    @PostMapping("/api/v1/auth/refresh")
    @Operation(summary = "Rotar el token de refresco (reutilizar uno revocado invalida toda la sesión)")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest req) {
        return auth.refresh(req.refreshToken());
    }

    @PostMapping("/api/v1/auth/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Cerrar sesión revocando el token de refresco")
    public void logout(@Valid @RequestBody RefreshRequest req) {
        auth.logout(req.refreshToken());
    }

    @GetMapping("/api/v1/consent-texts")
    @Operation(summary = "Textos vigentes de consentimiento por finalidad")
    public List<ConsentTextResponse> consentTexts() {
        return consents.currentTexts();
    }
}
