package io.github.diegofranciscog.norte.scoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.github.diegofranciscog.norte.scoring.IndexModels.Company;
import io.github.diegofranciscog.norte.scoring.IndexModels.Job;
import io.github.diegofranciscog.norte.scoring.IndexModels.JobSkill;
import io.github.diegofranciscog.norte.scoring.IndexModels.LanguageRequirement;
import io.github.diegofranciscog.norte.scoring.IndexModels.Location;
import io.github.diegofranciscog.norte.scoring.IndexModels.RemoteScope;
import io.github.diegofranciscog.norte.scoring.IndexModels.Salary;
import io.github.diegofranciscog.norte.scoring.IndexModels.ScoringConfig;
import io.github.diegofranciscog.norte.scoring.IndexModels.SkillsFile;
import io.github.diegofranciscog.norte.scoring.Scorer.ProfileSkill;
import io.github.diegofranciscog.norte.scoring.Scorer.ProfileView;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.json.JsonMapper;

/**
 * T-03 en Java: los mismos casos calculados a mano que usa TypeScript (data/fixtures/scoring-cases.json).
 * Si una de las dos implementaciones cambia y la otra no, esta prueba falla.
 */
class ScorerTest {

    private static final Path DATA = Path.of("..", "data");
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Golden GOLDEN = JSON.readValue(DATA.resolve("fixtures/scoring-cases.json").toFile(), Golden.class);
    private static final ScoringConfig CONFIG = JSON.readValue(DATA.resolve("config/scoring.json").toFile(), ScoringConfig.class);
    private static final SkillsFile CATALOG = JSON.readValue(DATA.resolve("skills/catalog.json").toFile(), SkillsFile.class);
    private static final Scorer SCORER = new Scorer(CONFIG, CATALOG.skills());
    private static final Instant NOW = Instant.parse(GOLDEN.now());

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Golden(String now, List<Case> cases) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Case(String name, JobSpec job, ProfileSpec profile, Expected expected) {
        @Override
        public String toString() {
            return name;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record JobSpec(List<List<Object>> skills, Integer yearsRequired, String seniority, String modality, String city, String country, Boolean ecuadorEligible,
            List<List<Object>> languages, List<Integer> salary, int daysAgo, String status) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ProfileSpec(List<String> demonstrated, List<String> declared, Double years, String english, String homeCity, boolean relocation, Integer minSalary,
            Map<String, Integer> weights) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Expected(double total, Map<String, Double> components, String fit) {
    }

    static Job job(JobSpec s) {
        RemoteScope scope = "remote".equals(s.modality())
                ? new RemoteScope(s.ecuadorEligible() == null ? "unknown" : s.ecuadorEligible() ? "latam" : "excluding-latam", s.ecuadorEligible())
                : null;
        List<JobSkill> skills = s.skills().stream().map(t -> new JobSkill((String) t.get(0), (Boolean) t.get(1))).toList();
        List<LanguageRequirement> languages = s.languages().stream().map(t -> new LanguageRequirement((String) t.get(0), (String) t.get(1), (Boolean) t.get(2))).toList();
        Salary salary = s.salary() == null ? null : new Salary(s.salary().get(0), s.salary().get(1), true);
        String published = NOW.minus(Duration.ofDays(s.daysAgo())).toString();
        return new Job("j_test", "Vacante de prueba", new Company("Ficticia"), new Location(s.city(), null, s.country()), s.modality(), scope, s.seniority(),
                s.yearsRequired(), skills, salary, languages, published, NOW.toString(), s.status(), List.of());
    }

    static ProfileView profile(ProfileSpec p) {
        List<ProfileSkill> skills = new ArrayList<>();
        p.demonstrated().forEach(id -> skills.add(new ProfileSkill(id, true)));
        p.declared().forEach(id -> skills.add(new ProfileSkill(id, false)));
        return new ProfileView(skills, p.years(), p.english(), p.homeCity(), p.relocation(), p.minSalary(), p.weights());
    }

    static Stream<Case> cases() {
        return GOLDEN.cases().stream();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    void reproduceLosCasosCalculadosAMano(Case c) {
        Scorer.Result r = SCORER.score(job(c.job()), profile(c.profile()), NOW);

        assertThat(r.points().keySet()).containsExactlyElementsOf(Scorer.COMPONENTS);
        c.expected().components().forEach((key, expected) -> assertThat(r.points().get(key)).as(key).isCloseTo(expected, within(1e-9)));
        assertThat(r.total()).isCloseTo(c.expected().total(), within(1e-9));
        assertThat(r.fit()).isEqualTo("good".equals(c.expected().fit()));
        double sum = Math.round(r.points().values().stream().mapToDouble(Double::doubleValue).sum() * 10) / 10.0;
        assertThat(sum).isCloseTo(r.total(), within(1e-9));
    }

    @Test
    void escalaLosPesosA100EIgnoraNegativos() {
        Map<String, Double> w = SCORER.effectiveWeights(Map.of("demonstrated", -5));
        assertThat(w.get("demonstrated")).isZero();
        assertThat(w.values().stream().mapToDouble(Double::doubleValue).sum()).isCloseTo(100, within(1e-9));
        assertThat(SCORER.effectiveWeights(null)).isEqualTo(SCORER.effectiveWeights(Map.of()));
    }

    @Test
    void unaVacanteCerradaNoSumaFrescura() {
        Case base = GOLDEN.cases().getFirst();
        JobSpec s = base.job();
        JobSpec closed = new JobSpec(s.skills(), s.yearsRequired(), s.seniority(), s.modality(), s.city(), s.country(), s.ecuadorEligible(), s.languages(), s.salary(),
                s.daysAgo(), "closed");
        assertThat(SCORER.score(job(closed), profile(base.profile()), NOW).points().get("freshness")).isZero();
    }

    @Test
    void loQueNoEstaEnElPerfilNoSuma() {
        Case base = GOLDEN.cases().getFirst();
        JobSpec s = base.job();
        JobSpec rust = new JobSpec(List.of(List.of("rust", false)), s.yearsRequired(), s.seniority(), s.modality(), s.city(), s.country(), s.ecuadorEligible(),
                s.languages(), s.salary(), s.daysAgo(), s.status());
        Scorer.Result r = SCORER.score(job(rust), profile(base.profile()), NOW);
        assertThat(r.points().get("demonstrated")).isZero();
        assertThat(r.points().get("declared")).isZero();
    }
}
