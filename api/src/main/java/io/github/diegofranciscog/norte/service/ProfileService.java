package io.github.diegofranciscog.norte.service;

import io.github.diegofranciscog.norte.config.NorteProperties;
import io.github.diegofranciscog.norte.domain.AnalyzedRepo;
import io.github.diegofranciscog.norte.domain.Enums.ConsentPurpose;
import io.github.diegofranciscog.norte.domain.Profile;
import io.github.diegofranciscog.norte.domain.ProfileSkill;
import io.github.diegofranciscog.norte.dto.ProfileDtos.ProfileRequest;
import io.github.diegofranciscog.norte.dto.ProfileDtos.ProfileResponse;
import io.github.diegofranciscog.norte.dto.ProfileDtos.RepoItem;
import io.github.diegofranciscog.norte.dto.ProfileDtos.SkillItem;
import io.github.diegofranciscog.norte.exception.ApiException;
import io.github.diegofranciscog.norte.mapper.DtoMapper;
import io.github.diegofranciscog.norte.repository.AnalyzedRepoRepository;
import io.github.diegofranciscog.norte.repository.ProfileRepository;
import io.github.diegofranciscog.norte.repository.ProfileSkillRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Perfil guardado en la cuenta: solo con el consentimiento PROFILE_STORAGE, y se borra si se retira. */
@Service
public class ProfileService {

    private static final int MAX_SKILLS = 400;
    private static final int MAX_REPOS = 50;

    private final ProfileRepository profiles;
    private final ProfileSkillRepository skills;
    private final AnalyzedRepoRepository repos;
    private final ConsentService consents;
    private final AuditService audit;
    private final NorteProperties props;

    public ProfileService(ProfileRepository profiles, ProfileSkillRepository skills, AnalyzedRepoRepository repos, ConsentService consents, AuditService audit, NorteProperties props) {
        this.profiles = profiles;
        this.skills = skills;
        this.repos = repos;
        this.consents = consents;
        this.audit = audit;
        this.props = props;
    }

    private Profile profileOf(UUID userId) {
        return profiles.findById(userId).orElseGet(() -> profiles.save(new Profile(userId, props.defaultHomeCity())));
    }

    @Transactional
    public ProfileResponse get(UUID userId) {
        return DtoMapper.toResponse(profileOf(userId));
    }

    @Transactional
    public ProfileResponse update(UUID userId, ProfileRequest req) {
        consents.require(userId, ConsentPurpose.PROFILE_STORAGE);
        Profile p = profileOf(userId);
        Map<String, Integer> weights = req.weights() == null ? null : new LinkedHashMap<>(req.weights());
        p.update(req.homeCity().trim(), req.acceptsRelocation(), req.yearsOfExperience(), req.englishLevel(), req.minSalaryUsd(), weights, req.githubUser());
        audit.record(userId, "PROFILE_UPDATED", null);
        return DtoMapper.toResponse(p);
    }

    @Transactional(readOnly = true)
    public List<SkillItem> skills(UUID userId) {
        return skills.findByUserIdOrderBySkillIdAsc(userId).stream().map(DtoMapper::toItem).toList();
    }

    /** Reemplaza el conjunto completo de habilidades: lo que no llega, se borra. */
    @Transactional
    public List<SkillItem> replaceSkills(UUID userId, List<SkillItem> items) {
        consents.require(userId, ConsentPurpose.PROFILE_STORAGE);
        if (items.size() > MAX_SKILLS) {
            throw ApiException.badRequest("too-many-skills", "Demasiadas habilidades.");
        }
        Map<String, SkillItem> unique = new LinkedHashMap<>();
        for (SkillItem i : items) {
            unique.merge(i.skillId(), i, (a, b) -> a.origin().ordinal() <= b.origin().ordinal() ? a : b);
        }
        skills.deleteByUser(userId);
        skills.flush();
        skills.saveAll(unique.values().stream().map(i -> new ProfileSkill(userId, i.skillId(), i.escoUri(), i.origin(), i.repos() == null ? List.of() : i.repos())).toList());
        audit.record(userId, "SKILLS_UPDATED", unique.size() + " habilidades");
        return skills(userId);
    }

    @Transactional(readOnly = true)
    public List<RepoItem> repos(UUID userId) {
        return repos.findByUserIdOrderByNameAsc(userId).stream().map(DtoMapper::toItem).toList();
    }

    @Transactional
    public List<RepoItem> replaceRepos(UUID userId, List<RepoItem> items) {
        consents.require(userId, ConsentPurpose.PROFILE_STORAGE);
        if (items.size() > MAX_REPOS) {
            throw ApiException.badRequest("too-many-repos", "Demasiados repositorios.");
        }
        repos.deleteByUser(userId);
        repos.flush();
        repos.saveAll(items.stream().map(i -> new AnalyzedRepo(userId, i.name(), i.url(), i.pushedAt(), i.skills() == null ? List.of() : i.skills())).toList());
        audit.record(userId, "REPOS_UPDATED", items.size() + " repositorios");
        return repos(userId);
    }

    /** Al retirar el consentimiento se deja de tratar y se borra lo guardado para esa finalidad. */
    @Transactional
    public void wipe(UUID userId) {
        skills.deleteByUser(userId);
        repos.deleteByUser(userId);
        profiles.findById(userId).ifPresent(p -> p.update(props.defaultHomeCity(), false, null, null, null, null, null));
        audit.record(userId, "PROFILE_WIPED", null);
    }
}
