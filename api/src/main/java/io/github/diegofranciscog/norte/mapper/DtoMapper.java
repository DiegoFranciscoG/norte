package io.github.diegofranciscog.norte.mapper;

import io.github.diegofranciscog.norte.domain.AnalyzedRepo;
import io.github.diegofranciscog.norte.domain.Application;
import io.github.diegofranciscog.norte.domain.ApplicationEvent;
import io.github.diegofranciscog.norte.domain.Profile;
import io.github.diegofranciscog.norte.domain.ProfileSkill;
import io.github.diegofranciscog.norte.dto.ApplicationDtos.ApplicationResponse;
import io.github.diegofranciscog.norte.dto.ApplicationDtos.StatusChange;
import io.github.diegofranciscog.norte.dto.ProfileDtos.ProfileResponse;
import io.github.diegofranciscog.norte.dto.ProfileDtos.RepoItem;
import io.github.diegofranciscog.norte.dto.ProfileDtos.SkillItem;
import java.util.List;

/** Conversión explícita entidad → DTO: la API nunca expone entidades JPA. */
public final class DtoMapper {

    private DtoMapper() {
    }

    public static ProfileResponse toResponse(Profile p) {
        return new ProfileResponse(p.getHomeCountry(), p.getHomeCity(), p.getModalities(), p.isAcceptsRelocation(), p.getYearsOfExperience(), p.getEnglishLevel(), p.getMinSalaryUsd(), p.getWeights(), p.getGithubUser(), p.getUpdatedAt());
    }

    public static SkillItem toItem(ProfileSkill s) {
        return new SkillItem(s.getSkillId(), s.getEscoUri(), s.getOrigin(), s.getRepos());
    }

    public static RepoItem toItem(AnalyzedRepo r) {
        return new RepoItem(r.getName(), r.getUrl(), r.getPushedAt(), r.getSkills());
    }

    public static ApplicationResponse toResponse(Application a, List<ApplicationEvent> events) {
        List<StatusChange> history = events.stream().filter(e -> e.getApplicationId().equals(a.getId())).map(e -> new StatusChange(e.getStatus(), e.getChangedAt())).toList();
        return new ApplicationResponse(a.getId(), a.getJobId(), a.getJobTitle(), a.getCompany(), a.getJobUrl(), a.getStatus(), a.getAppliedAt(), a.getFollowUpAt(), a.getNotes(), a.getCreatedAt(), a.getUpdatedAt(), history);
    }
}
