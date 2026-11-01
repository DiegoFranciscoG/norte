package io.github.diegofranciscog.norte.scoring;

import io.github.diegofranciscog.norte.scoring.IndexModels.Job;
import io.github.diegofranciscog.norte.scoring.IndexModels.JobSkill;
import io.github.diegofranciscog.norte.scoring.IndexModels.LanguageRequirement;
import io.github.diegofranciscog.norte.scoring.IndexModels.RemoteScope;
import io.github.diegofranciscog.norte.scoring.IndexModels.ScoringConfig;
import io.github.diegofranciscog.norte.scoring.IndexModels.SkillDef;
import java.text.Normalizer;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Puerto en Java del puntaje de packages/core/src/score.ts para las alertas por correo.
 * Debe dar exactamente los mismos números: ambos se validan con data/fixtures/scoring-cases.json (T-03).
 */
public final class Scorer {

    public static final List<String> COMPONENTS = List.of("demonstrated", "declared", "experience", "location", "language", "compensation", "freshness");
    private static final List<String> CEFR = List.of("A1", "A2", "B1", "B2", "C1", "C2");
    private static final long DAY_MS = 86_400_000L;

    public record ProfileSkill(String id, boolean demonstrated) {
    }

    /** homeCountry (ISO alfa-2) y homeCity pueden ser null si la persona aún no indicó dónde vive. */
    public record ProfileView(List<ProfileSkill> skills, Double yearsOfExperience, String englishLevel, String homeCountry, String homeCity, boolean acceptsRelocation, Integer minSalaryUsd, Map<String, Integer> weights) {
    }

    public record Result(double total, Map<String, Double> points, boolean fit) {
    }

    private final ScoringConfig config;
    private final Map<String, SkillDef> catalog;
    private final Map<String, List<String>> regions;

    public Scorer(ScoringConfig config, List<SkillDef> skills, Map<String, List<String>> regions) {
        this.config = config;
        this.catalog = skills.stream().collect(Collectors.toMap(SkillDef::id, Function.identity(), (a, b) -> a));
        this.regions = regions == null ? Map.of() : regions;
    }

    /** Igual que remoteEligibility() de TypeScript: true, false o null si no se puede saber. */
    public Boolean remoteEligibility(RemoteScope scope, String country) {
        if (scope == null || scope.type() == null || "unknown".equals(scope.type())) {
            return null;
        }
        if ("worldwide".equals(scope.type())) {
            return true;
        }
        if (country == null) {
            return null;
        }
        boolean listed = scope.countries() != null && scope.countries().contains(country);
        boolean inRegion = scope.regions() != null && scope.regions().stream().anyMatch(r -> regions.getOrDefault(r, List.of()).contains(country));
        return listed || inRegion;
    }

    Set<String> expandImplied(Iterable<String> ids) {
        Set<String> out = new HashSet<>();
        Deque<String> stack = new ArrayDeque<>();
        ids.forEach(stack::push);
        while (!stack.isEmpty()) {
            String id = stack.pop();
            SkillDef def = catalog.get(id);
            if (def == null || !out.add(id)) {
                continue;
            }
            if (def.implies() != null) {
                def.implies().forEach(stack::push);
            }
        }
        return out;
    }

    Map<String, Double> effectiveWeights(Map<String, Integer> custom) {
        Map<String, Double> raw = new LinkedHashMap<>();
        for (String k : COMPONENTS) {
            double base = config.weights().getOrDefault(k, 0.0);
            raw.put(k, custom != null && custom.containsKey(k) ? custom.get(k).doubleValue() : base);
        }
        double sum = raw.values().stream().mapToDouble(v -> Math.max(0, v)).sum();
        if (sum <= 0) {
            return new LinkedHashMap<>(config.weights());
        }
        Map<String, Double> out = new LinkedHashMap<>();
        raw.forEach((k, v) -> out.put(k, (Math.max(0, v) * 100) / sum));
        return out;
    }

    private double round(double value) {
        double f = Math.pow(10, config.decimals());
        return Math.round(value * f) / f;
    }

    /** Igual que placeKey() de TypeScript: sin tildes, minúsculas, solo letras y números separados por un espacio. */
    static String placeKey(String s) {
        return Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    private static int rank(String level) {
        return CEFR.indexOf(level) + 1;
    }

    public Result score(Job job, ProfileView profile, Instant now) {
        Map<String, Double> weights = effectiveWeights(profile.weights());
        Set<String> demonstrated = expandImplied(profile.skills().stream().filter(ProfileSkill::demonstrated).map(ProfileSkill::id).toList());
        Set<String> declaredIds = new HashSet<>(demonstrated);
        profile.skills().forEach(s -> declaredIds.add(s.id()));
        Set<String> declared = expandImplied(declaredIds);
        Map<String, Double> ratio = new LinkedHashMap<>();

        List<JobSkill> jobSkills = job.skills() == null ? List.of() : job.skills().stream().filter(s -> {
            SkillDef def = catalog.get(s.id());
            return def != null && !config.skills().excludeCategories().contains(def.category());
        }).toList();
        double totalW = jobSkills.stream().mapToDouble(s -> s.optional() ? config.skills().optionalWeight() : 1).sum();
        if (totalW == 0) {
            ratio.put("demonstrated", 0.0);
            ratio.put("declared", 0.0);
        } else {
            ratio.put("demonstrated", jobSkills.stream().filter(s -> demonstrated.contains(s.id())).mapToDouble(s -> s.optional() ? config.skills().optionalWeight() : 1).sum() / totalW);
            ratio.put("declared", jobSkills.stream().filter(s -> declared.contains(s.id())).mapToDouble(s -> s.optional() ? config.skills().optionalWeight() : 1).sum() / totalW);
        }

        Double levelYears = "unknown".equals(job.seniority()) || job.seniority() == null ? null : config.experience().levelMinYears().get(job.seniority());
        Double required = job.yearsRequired() != null ? Double.valueOf(job.yearsRequired()) : levelYears;
        if (required == null || required == 0) {
            ratio.put("experience", 1.0);
        } else {
            double have = profile.yearsOfExperience() == null ? 0 : profile.yearsOfExperience();
            ratio.put("experience", Math.min(1, have / required));
        }

        var L = config.location();
        String jobCountry = job.location() == null ? null : job.location().country();
        if ("remote".equals(job.modality())) {
            Boolean eligible = remoteEligibility(job.remoteScope(), profile.homeCountry());
            ratio.put("location", Boolean.FALSE.equals(eligible) ? L.remoteExcluded() : eligible == null ? L.remoteScopeUnknown() : L.remoteEligible());
        } else if (profile.homeCountry() == null) {
            ratio.put("location", L.unknownUserLocation());
        } else if (profile.homeCountry().equals(jobCountry)) {
            String city = job.location().city();
            boolean home = city != null && profile.homeCity() != null && placeKey(city).equals(placeKey(profile.homeCity()));
            ratio.put("location", home ? L.home() : profile.acceptsRelocation() ? L.sameCountryOtherCityWithRelocation() : L.sameCountryOtherCityWithoutRelocation());
        } else {
            ratio.put("location", L.abroad());
        }

        List<LanguageRequirement> reqs = job.languages() == null ? List.of() : job.languages().stream().filter(l -> !config.language().nativeLanguage().equals(l.language())).toList();
        if (reqs.isEmpty()) {
            ratio.put("language", 1.0);
        } else {
            double worst = Double.MAX_VALUE;
            for (LanguageRequirement r : reqs) {
                String needed = r.level() != null ? r.level() : config.language().defaultRequiredLevel();
                String have = "en".equals(r.language()) ? profile.englishLevel() : null;
                double v = have == null ? 0 : Math.min(1, (double) rank(have) / rank(needed));
                worst = Math.min(worst, v);
            }
            ratio.put("language", worst);
        }

        Integer offer = job.salary() != null && job.salary().convertible() ? (job.salary().usdMonthlyMax() != null ? job.salary().usdMonthlyMax() : job.salary().usdMonthlyMin()) : null;
        if (offer == null || profile.minSalaryUsd() == null) {
            ratio.put("compensation", 1.0);
        } else {
            ratio.put("compensation", Math.min(1, offer.doubleValue() / profile.minSalaryUsd()));
        }

        long days = Math.max(0, Math.floorDiv(now.toEpochMilli() - Instant.parse(job.publishedAt()).toEpochMilli(), DAY_MS));
        var F = config.freshness();
        double fresh = "closed".equals(job.status()) ? 0 : days <= F.fullUntilDays() ? 1 : days >= F.zeroAtDays() ? 0 : 1 - (days - F.fullUntilDays()) / (F.zeroAtDays() - F.fullUntilDays());
        ratio.put("freshness", fresh);

        Map<String, Double> points = new LinkedHashMap<>();
        double sum = 0;
        for (String k : COMPONENTS) {
            double p = round(weights.get(k) * ratio.get(k));
            points.put(k, p);
            sum += p;
        }
        double total = round(sum);
        return new Result(total, points, total >= config.fitThreshold());
    }
}
