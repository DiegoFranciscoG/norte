package io.github.diegofranciscog.norte.service;

import io.github.diegofranciscog.norte.domain.Alert;
import io.github.diegofranciscog.norte.domain.Profile;
import io.github.diegofranciscog.norte.domain.RefreshToken;
import io.github.diegofranciscog.norte.domain.User;
import io.github.diegofranciscog.norte.dto.AuthDtos.ConsentDecision;
import io.github.diegofranciscog.norte.dto.AuthDtos.RegisterRequest;
import io.github.diegofranciscog.norte.dto.AuthDtos.TokenResponse;
import io.github.diegofranciscog.norte.exception.ApiException;
import io.github.diegofranciscog.norte.repository.AlertRepository;
import io.github.diegofranciscog.norte.repository.ProfileRepository;
import io.github.diegofranciscog.norte.repository.RefreshTokenRepository;
import io.github.diegofranciscog.norte.repository.UserRepository;
import io.github.diegofranciscog.norte.security.LoginRateLimiter;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final ProfileRepository profiles;
    private final AlertRepository alerts;
    private final ConsentService consents;
    private final TokenService tokens;
    private final PasswordEncoder passwords;
    private final LoginRateLimiter limiter;
    private final AuditService audit;
    /** Hash de una clave aleatoria: se compara aunque el correo no exista, así el tiempo de respuesta no delata cuentas. */
    private final String dummyHash;

    public AuthService(UserRepository users, RefreshTokenRepository refreshTokens, ProfileRepository profiles, AlertRepository alerts, ConsentService consents,
            TokenService tokens, PasswordEncoder passwords, LoginRateLimiter limiter, AuditService audit) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.profiles = profiles;
        this.alerts = alerts;
        this.consents = consents;
        this.tokens = tokens;
        this.passwords = passwords;
        this.limiter = limiter;
        this.audit = audit;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    @Transactional
    public void register(RegisterRequest req, String ip) {
        String email = normalizeEmail(req.email());
        limiter.check(ip, email);
        if (users.existsByEmailIgnoreCase(email)) {
            limiter.recordFailure(ip, email);
            throw ApiException.conflict("email-taken", "Ya existe una cuenta con ese correo.");
        }
        User user = users.save(new User(email, passwords.encode(req.password())));
        profiles.save(new Profile(user.getId()));
        alerts.save(new Alert(user.getId(), 70));
        List<ConsentDecision> decisions = req.consents() == null ? List.of() : req.consents();
        for (ConsentDecision d : decisions) {
            if (d.granted()) {
                consents.decide(user.getId(), d.purpose(), true, d.textVersion());
            }
        }
        audit.record(user.getId(), "REGISTER", null);
        limiter.recordAttempt(ip);
    }

    @Transactional
    public TokenResponse login(String rawEmail, String password, String ip) {
        String email = normalizeEmail(rawEmail);
        limiter.check(ip, email);
        User user = users.findByEmailIgnoreCase(email).orElse(null);
        boolean ok = passwords.matches(password, user == null ? dummyHash : user.getPasswordHash());
        if (user == null || !ok) {
            limiter.recordFailure(ip, email);
            throw ApiException.unauthorized("Correo o contraseña incorrectos.");
        }
        limiter.reset(email);
        user.markLogin();
        audit.record(user.getId(), "LOGIN", null);
        return issue(user, UUID.randomUUID());
    }

    /**
     * Rota el token de refresco. Si llega uno ya revocado, alguien lo reutilizó (posible robo):
     * se revoca toda la familia y se obliga a iniciar sesión de nuevo.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public TokenResponse refresh(String refreshToken) {
        RefreshToken current = refreshTokens.findByTokenHash(TokenService.hash(refreshToken))
                .orElseThrow(() -> ApiException.unauthorized("Sesión no válida."));
        if (current.isRevoked()) {
            refreshTokens.revokeFamily(current.getFamilyId());
            audit.record(current.getUserId(), "REFRESH_REUSE_DETECTED", null);
            throw ApiException.unauthorized("Sesión revocada por seguridad. Inicia sesión de nuevo.");
        }
        if (current.getExpiresAt().isBefore(Instant.now())) {
            current.revoke();
            throw ApiException.unauthorized("Sesión expirada.");
        }
        current.revoke();
        User user = users.findById(current.getUserId()).orElseThrow(() -> ApiException.unauthorized("Sesión no válida."));
        return issue(user, current.getFamilyId());
    }

    @Transactional
    public void logout(String refreshToken) {
        refreshTokens.findByTokenHash(TokenService.hash(refreshToken)).ifPresent(t -> refreshTokens.revokeFamily(t.getFamilyId()));
    }

    private TokenResponse issue(User user, UUID familyId) {
        String refresh = tokens.newRefreshToken();
        refreshTokens.save(new RefreshToken(user.getId(), TokenService.hash(refresh), familyId, tokens.refreshExpiry()));
        return new TokenResponse(tokens.accessToken(user.getId()), tokens.accessTtlSeconds(), refresh, user.getEmail());
    }
}
