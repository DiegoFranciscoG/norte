package io.github.diegofranciscog.norte.service;

import io.github.diegofranciscog.norte.domain.AuditLog;
import io.github.diegofranciscog.norte.repository.AuditLogRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Bitácora mínima: acción y fecha. El detalle nunca lleva correos ni contenido del perfil. */
@Service
public class AuditService {

    private final AuditLogRepository repository;

    public AuditService(AuditLogRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(UUID userId, String action, String detail) {
        repository.save(new AuditLog(userId, action, detail));
    }
}
