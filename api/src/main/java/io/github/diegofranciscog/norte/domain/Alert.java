package io.github.diegofranciscog.norte.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "alerts")
public class Alert {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "min_score", nullable = false)
    private int minScore;

    @Column(name = "last_index_version", length = 40)
    private String lastIndexVersion;

    @Column(name = "last_run_at")
    private Instant lastRunAt;

    @Column(name = "last_sent_at")
    private Instant lastSentAt;

    protected Alert() {
    }

    public Alert(UUID userId, int minScore) {
        this.userId = userId;
        this.minScore = minScore;
    }

    public void configure(boolean enabled, int minScore) {
        this.enabled = enabled;
        this.minScore = minScore;
    }

    public void disable() {
        this.enabled = false;
    }

    public void recordRun(String indexVersion, boolean sent) {
        this.lastIndexVersion = indexVersion;
        this.lastRunAt = Instant.now();
        if (sent) {
            this.lastSentAt = this.lastRunAt;
        }
    }

    public UUID getUserId() {
        return userId;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public int getMinScore() {
        return minScore;
    }

    public String getLastIndexVersion() {
        return lastIndexVersion;
    }

    public Instant getLastRunAt() {
        return lastRunAt;
    }

    public Instant getLastSentAt() {
        return lastSentAt;
    }
}
