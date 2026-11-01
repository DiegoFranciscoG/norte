package io.github.diegofranciscog.norte.service;

import io.github.diegofranciscog.norte.domain.Alert;
import io.github.diegofranciscog.norte.domain.Enums.ConsentPurpose;
import io.github.diegofranciscog.norte.domain.User;
import io.github.diegofranciscog.norte.dto.AccountDtos.AlertSettings;
import io.github.diegofranciscog.norte.dto.AccountDtos.AuditRecord;
import io.github.diegofranciscog.norte.dto.AccountDtos.ConsentRecord;
import io.github.diegofranciscog.norte.dto.AccountDtos.ExportResponse;
import io.github.diegofranciscog.norte.exception.ApiException;
import io.github.diegofranciscog.norte.repository.AlertRepository;
import io.github.diegofranciscog.norte.repository.AuditLogRepository;
import io.github.diegofranciscog.norte.repository.ConsentRepository;
import io.github.diegofranciscog.norte.repository.UserRepository;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Derechos del titular (LOPDP): exportar todo y borrar la cuenta de verdad. */
@Service
public class AccountService {

    private final UserRepository users;
    private final ConsentRepository consents;
    private final AuditLogRepository auditLog;
    private final AlertRepository alerts;
    private final ProfileService profiles;
    private final ApplicationService applications;
    private final ConsentService consentService;
    private final AuditService audit;
    private final PasswordEncoder passwords;

    public AccountService(UserRepository users, ConsentRepository consents, AuditLogRepository auditLog, AlertRepository alerts, ProfileService profiles,
            ApplicationService applications, ConsentService consentService, AuditService audit, PasswordEncoder passwords) {
        this.users = users;
        this.consents = consents;
        this.auditLog = auditLog;
        this.alerts = alerts;
        this.profiles = profiles;
        this.applications = applications;
        this.consentService = consentService;
        this.audit = audit;
        this.passwords = passwords;
    }

    @Transactional
    public ExportResponse export(UUID userId) {
        User user = users.findById(userId).orElseThrow(() -> ApiException.notFound("La cuenta"));
        Alert alert = alerts.findById(userId).orElse(null);
        ExportResponse export = new ExportResponse(
                Instant.now(),
                user.getEmail(),
                user.getCreatedAt(),
                profiles.get(userId),
                profiles.skills(userId),
                profiles.repos(userId),
                applications.list(userId),
                alert == null ? null : new AlertSettings(alert.isEnabled(), alert.getMinScore()),
                consents.findByUserIdOrderByDecidedAtAsc(userId).stream().map(c -> new ConsentRecord(c.getPurpose(), c.getTextVersion(), c.isGranted(), c.getDecidedAt())).toList(),
                auditLog.findByUserIdOrderByAtAsc(userId).stream().map(a -> new AuditRecord(a.getAction(), a.getAt(), a.getDetail())).toList());
        audit.record(userId, "EXPORT", null);
        return export;
    }

    /**
     * Borrado real, no lógico: se elimina la fila del usuario y la base borra en cascada todo lo que depende de él.
     * Queda solo un evento anónimo de que hubo un borrado (sin id ni correo), para poder rendir cuentas.
     */
    @Transactional
    public void delete(UUID userId, String password) {
        User user = users.findById(userId).orElseThrow(() -> ApiException.notFound("La cuenta"));
        if (!passwords.matches(password, user.getPasswordHash())) {
            throw ApiException.unauthorized("La contraseña no es correcta.");
        }
        users.hardDelete(userId);
        audit.record(null, "ACCOUNT_DELETED", null);
    }

    @Transactional(readOnly = true)
    public AlertSettings alertSettings(UUID userId) {
        Alert a = alerts.findById(userId).orElseGet(() -> new Alert(userId, 70));
        return new AlertSettings(a.isEnabled(), a.getMinScore());
    }

    @Transactional
    public AlertSettings updateAlerts(UUID userId, AlertSettings settings) {
        if (settings.enabled()) {
            consentService.require(userId, ConsentPurpose.EMAIL_ALERTS);
            consentService.require(userId, ConsentPurpose.PROFILE_STORAGE);
        }
        Alert a = alerts.findById(userId).orElseGet(() -> alerts.save(new Alert(userId, settings.minScore())));
        a.configure(settings.enabled(), settings.minScore());
        audit.record(userId, "ALERTS_UPDATED", settings.enabled() ? "activadas" : "desactivadas");
        return new AlertSettings(a.isEnabled(), a.getMinScore());
    }

    /** Retirar un consentimiento detiene el tratamiento y borra lo guardado para esa finalidad. */
    @Transactional
    public void changeConsent(UUID userId, ConsentPurpose purpose, boolean granted, String textVersion) {
        consentService.decide(userId, purpose, granted, textVersion);
        if (!granted && purpose == ConsentPurpose.PROFILE_STORAGE) {
            profiles.wipe(userId);
            alerts.findById(userId).ifPresent(Alert::disable);
        }
        if (!granted && purpose == ConsentPurpose.EMAIL_ALERTS) {
            alerts.findById(userId).ifPresent(Alert::disable);
        }
    }
}
