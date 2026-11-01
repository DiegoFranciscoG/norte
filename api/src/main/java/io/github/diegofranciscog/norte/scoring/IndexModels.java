package io.github.diegofranciscog.norte.scoring;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;

/** Lo que la API lee del índice estático público (subconjunto de los archivos que publica la ingesta). */
public final class IndexModels {

    private IndexModels() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record IndexInfo(Build build, Home home) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Build(String version, String generatedAt) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Home(String city, String country) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record JobsFile(List<Job> jobs) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Job(
            String id,
            String title,
            Company company,
            Location location,
            String modality,
            RemoteScope remoteScope,
            String seniority,
            Integer yearsRequired,
            List<JobSkill> skills,
            Salary salary,
            List<LanguageRequirement> languages,
            String publishedAt,
            String firstSeenAt,
            String status,
            List<SourceRef> sources) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Company(String name) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Location(String city, String province, String country) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    /** worldwide | regions | countries | unknown, con las regiones y países (ISO alfa-2) admitidos. */
    public record RemoteScope(String type, List<String> regions, List<String> countries) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record JobSkill(String id, boolean optional) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Salary(Integer usdMonthlyMin, Integer usdMonthlyMax, boolean convertible) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LanguageRequirement(String language, String level, boolean inferred) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SourceRef(String sourceId, String sourceName, String url, String applyUrl, boolean allowInAlerts) {
    }

    /** Pertenencia de países a regiones (geo.json del índice) para decidir si un remoto admite un país. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GeoFile(Map<String, List<String>> regions) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SkillsFile(List<SkillDef> skills) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SkillDef(String id, String name, String category, List<String> implies) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ScoringConfig(
            Map<String, Double> weights,
            double fitThreshold,
            int decimals,
            SkillsConfig skills,
            ExperienceConfig experience,
            LocationConfig location,
            LanguageConfig language,
            FreshnessConfig freshness) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SkillsConfig(double optionalWeight, List<String> excludeCategories) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ExperienceConfig(Map<String, Double> levelMinYears) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LocationConfig(double home, double sameCountryOtherCityWithRelocation, double sameCountryOtherCityWithoutRelocation, double remoteEligible, double remoteScopeUnknown, double remoteExcluded, double abroad, double unknownUserLocation) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LanguageConfig(String defaultRequiredLevel, String nativeLanguage) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FreshnessConfig(double fullUntilDays, double zeroAtDays) {
    }
}
