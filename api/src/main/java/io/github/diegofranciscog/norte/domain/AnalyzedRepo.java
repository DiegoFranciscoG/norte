package io.github.diegofranciscog.norte.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "analyzed_repos")
public class AnalyzedRepo {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 300)
    private String url;

    @Column(name = "pushed_at")
    private Instant pushedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<String> skills;

    @Column(name = "analyzed_at", nullable = false)
    private Instant analyzedAt;

    protected AnalyzedRepo() {
    }

    public AnalyzedRepo(UUID userId, String name, String url, Instant pushedAt, List<String> skills) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.name = name;
        this.url = url;
        this.pushedAt = pushedAt;
        this.skills = skills;
        this.analyzedAt = Instant.now();
    }

    public String getName() {
        return name;
    }

    public String getUrl() {
        return url;
    }

    public Instant getPushedAt() {
        return pushedAt;
    }

    public List<String> getSkills() {
        return skills;
    }

    public Instant getAnalyzedAt() {
        return analyzedAt;
    }
}
