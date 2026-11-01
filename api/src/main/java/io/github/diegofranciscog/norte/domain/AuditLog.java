package io.github.diegofranciscog.norte.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Evento de auditoría. El detalle nunca contiene datos personales (ni correo ni contenido del perfil). */
@Entity
@Table(name = "audit_log")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false, length = 40)
    private String action;

    @Column(nullable = false)
    private Instant at;

    @Column(length = 300)
    private String detail;

    protected AuditLog() {
    }

    public AuditLog(UUID userId, String action, String detail) {
        this.userId = userId;
        this.action = action;
        this.detail = detail;
        this.at = Instant.now();
    }

    public UUID getUserId() {
        return userId;
    }

    public String getAction() {
        return action;
    }

    public Instant getAt() {
        return at;
    }

    public String getDetail() {
        return detail;
    }
}
