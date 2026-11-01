package io.github.diegofranciscog.norte.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
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

    @Column(name = "home_country", length = 2)
    private String homeCountry;

    @Column(name = "home_city", length = 80)
    private String homeCity;

    /** onsite | hybrid | remote: lo que la persona busca (vacío = todo). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<String> modalities = List.of();

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

    public Profile(UUID userId) {
        this.userId = userId;
        this.updatedAt = Instant.now();
    }

    public void update(String homeCountry, String homeCity, List<String> modalities, boolean acceptsRelocation, BigDecimal years, String englishLevel, Integer minSalaryUsd, Map<String, Integer> weights, String githubUser) {
        this.homeCountry = homeCountry;
        this.homeCity = homeCity;
        this.modalities = modalities == null ? List.of() : List.copyOf(modalities);
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

    public String getHomeCountry() {
        return homeCountry;
    }

    public List<String> getModalities() {
        return modalities;
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
