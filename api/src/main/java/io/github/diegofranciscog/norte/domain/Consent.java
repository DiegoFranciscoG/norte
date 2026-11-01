package io.github.diegofranciscog.norte.domain;

import io.github.diegofranciscog.norte.domain.Enums.ConsentPurpose;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Decisión de consentimiento (solo inserción): finalidad, versión del texto y fecha. */
@Entity
@Table(name = "consents")
public class Consent {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private ConsentPurpose purpose;

    @Column(name = "text_version", nullable = false, length = 20)
    private String textVersion;

    @Column(nullable = false)
    private boolean granted;

    @Column(name = "decided_at", nullable = false)
    private Instant decidedAt;

    protected Consent() {
    }

    public Consent(UUID userId, ConsentPurpose purpose, String textVersion, boolean granted) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.purpose = purpose;
        this.textVersion = textVersion;
        this.granted = granted;
        this.decidedAt = Instant.now();
    }

    public ConsentPurpose getPurpose() {
        return purpose;
    }

    public String getTextVersion() {
        return textVersion;
    }

    public boolean isGranted() {
        return granted;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }
}
