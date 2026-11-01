package io.github.diegofranciscog.norte.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "profiles")
public class Profile {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "home_city", nullable = false, length = 80)
    private String homeCity;

    @Column(name = "accepts_relocation", nullable = false)
    private boolean acceptsRelocation;

    @Column(name = "years_of_experience", precision = 4, scale = 1)
    private BigDecimal yearsOfExperience;

    @Column(name = "english_level", length = 2)
    private String englishLevel;

    @Column(name = "min_salary_usd")
    private Integer minSalaryUsd;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Integer> weights;

    @Column(name = "github_user", length = 39)
    private String githubUser;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Profile() {
    }

    public Profile(UUID userId, String homeCity) {
        this.userId = userId;
        this.homeCity = homeCity;
        this.updatedAt = Instant.now();
    }

    public void update(String homeCity, boolean acceptsRelocation, BigDecimal years, String englishLevel, Integer minSalaryUsd, Map<String, Integer> weights, String githubUser) {
        this.homeCity = homeCity;
        this.acceptsRelocation = acceptsRelocation;
        this.yearsOfExperience = years;
        this.englishLevel = englishLevel;
        this.minSalaryUsd = minSalaryUsd;
        this.weights = weights;
        this.githubUser = githubUser;
        this.updatedAt = Instant.now();
    }

    public UUID getUserId() {
        return userId;
    }

    public String getHomeCity() {
        return homeCity;
    }

    public boolean isAcceptsRelocation() {
        return acceptsRelocation;
    }

    public BigDecimal getYearsOfExperience() {
        return yearsOfExperience;
    }

    public String getEnglishLevel() {
        return englishLevel;
    }

    public Integer getMinSalaryUsd() {
        return minSalaryUsd;
    }

    public Map<String, Integer> getWeights() {
        return weights;
    }

    public String getGithubUser() {
        return githubUser;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
