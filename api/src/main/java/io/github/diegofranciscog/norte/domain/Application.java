package io.github.diegofranciscog.norte.domain;

import io.github.diegofranciscog.norte.domain.Enums.ApplicationStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Postulación que la persona sigue. NORTE nunca postula por ella: solo registra lo que decide. */
@Entity
@Table(name = "applications")
public class Application {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "job_id", nullable = false, length = 40)
    private String jobId;

    @Column(name = "job_title", nullable = false, length = 300)
    private String jobTitle;

    @Column(nullable = false, length = 200)
    private String company;

    @Column(name = "job_url", length = 1000)
    private String jobUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15)
    private ApplicationStatus status;

    @Column(name = "applied_at")
    private LocalDate appliedAt;

    @Column(name = "follow_up_at")
    private LocalDate followUpAt;

    @Column(length = 4000)
    private String notes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Application() {
    }

    public Application(UUID userId, String jobId, String jobTitle, String company, String jobUrl) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.jobId = jobId;
        this.jobTitle = jobTitle;
        this.company = company;
        this.jobUrl = jobUrl;
        this.status = ApplicationStatus.SAVED;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    /** Devuelve true si el estado cambió (para registrar el evento). */
    public boolean update(String jobTitle, String company, String jobUrl, ApplicationStatus status, LocalDate appliedAt, LocalDate followUpAt, String notes) {
        boolean statusChanged = status != null && status != this.status;
        this.jobTitle = jobTitle;
        this.company = company;
        this.jobUrl = jobUrl;
        if (status != null) {
            this.status = status;
        }
        this.appliedAt = appliedAt != null ? appliedAt : (statusChanged && status == ApplicationStatus.APPLIED && this.appliedAt == null ? LocalDate.now() : this.appliedAt);
        this.followUpAt = followUpAt;
        this.notes = notes;
        this.updatedAt = Instant.now();
        return statusChanged;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getJobId() {
        return jobId;
    }

    public String getJobTitle() {
        return jobTitle;
    }

    public String getCompany() {
        return company;
    }

    public String getJobUrl() {
        return jobUrl;
    }

    public ApplicationStatus getStatus() {
        return status;
    }

    public LocalDate getAppliedAt() {
        return appliedAt;
    }

    public LocalDate getFollowUpAt() {
        return followUpAt;
    }

    public String getNotes() {
        return notes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
