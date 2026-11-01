package io.github.diegofranciscog.norte.domain;

import io.github.diegofranciscog.norte.domain.Enums.ApplicationStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Historial de estados de una postulación (fechas de cada cambio). */
@Entity
@Table(name = "application_events")
public class ApplicationEvent {

    @Id
    private UUID id;

    @Column(name = "application_id", nullable = false)
    private UUID applicationId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15)
    private ApplicationStatus status;

    @Column(name = "changed_at", nullable = false)
    private Instant changedAt;

    protected ApplicationEvent() {
    }

    public ApplicationEvent(UUID applicationId, ApplicationStatus status) {
        this.id = UUID.randomUUID();
        this.applicationId = applicationId;
        this.status = status;
        this.changedAt = Instant.now();
    }

    public UUID getApplicationId() {
        return applicationId;
    }

    public ApplicationStatus getStatus() {
        return status;
    }

    public Instant getChangedAt() {
        return changedAt;
    }
}
