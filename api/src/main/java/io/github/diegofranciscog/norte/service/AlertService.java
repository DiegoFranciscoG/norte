package io.github.diegofranciscog.norte.service;

import io.github.diegofranciscog.norte.config.NorteProperties;
import io.github.diegofranciscog.norte.domain.Alert;
import io.github.diegofranciscog.norte.domain.Enums.ConsentPurpose;
import io.github.diegofranciscog.norte.domain.Enums.SkillOrigin;
import io.github.diegofranciscog.norte.domain.Profile;
import io.github.diegofranciscog.norte.domain.User;
import io.github.diegofranciscog.norte.dto.AccountDtos.AlertRunSummary;
import io.github.diegofranciscog.norte.repository.AlertRepository;
import io.github.diegofranciscog.norte.repository.ProfileRepository;
import io.github.diegofranciscog.norte.repository.ProfileSkillRepository;
import io.github.diegofranciscog.norte.repository.UserRepository;
import io.github.diegofranciscog.norte.scoring.IndexModels.IndexInfo;
import io.github.diegofranciscog.norte.scoring.IndexModels.Job;
import io.github.diegofranciscog.norte.scoring.IndexModels.SourceRef;
import io.github.diegofranciscog.norte.scoring.Scorer;
import io.github.diegofranciscog.norte.scoring.Scorer.ProfileSkill;
import io.github.diegofranciscog.norte.scoring.Scorer.ProfileView;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Alertas por correo. Las dispara GitHub Actions al terminar cada ingesta (así el servidor gratuito
 * despierta solo cuando hay algo nuevo). Solo para quien consintió alertas y guardar su perfil, y solo
 * con vacantes de fuentes que permiten este uso (Remotive lo prohíbe).
 */
@Service
public class AlertService {

    private static final Logger log = LoggerFactory.getLogger(AlertService.class);

    private final AlertRepository alerts;
    private final UserRepository users;
    private final ProfileRepository profiles;
    private final ProfileSkillRepository skills;
    private final ConsentService consents;
    private final IndexClient index;
    private final AlertMailer mailer;
    private final AuditService audit;
    private final NorteProperties props;

    public AlertService(AlertRepository alerts, UserRepository users, ProfileRepository profiles, ProfileSkillRepository skills, ConsentService consents, IndexClient index,
            AlertMailer mailer, AuditService audit, NorteProperties props) {
        this.alerts = alerts;
        this.users = users;
        this.profiles = profiles;
        this.skills = skills;
        this.consents = consents;
        this.index = index;
        this.mailer = mailer;
        this.audit = audit;
        this.props = props;
    }

    @Transactional
    public AlertRunSummary run() {
        IndexInfo info = index.index();
        String version = info.build().version();
        List<Job> jobs = index.jobs().jobs().stream().filter(j -> "open".equals(j.status())).toList();
        Scorer scorer = new Scorer(index.scoring(), index.skills().skills());
        Instant now = Instant.now();
        int checked = 0;
        int sent = 0;
        for (Alert alert : alerts.findByEnabledTrue()) {
            if (version.equals(alert.getLastIndexVersion())) {
                continue;
            }
            if (!consents.isGranted(alert.getUserId(), ConsentPurpose.EMAIL_ALERTS) || !consents.isGranted(alert.getUserId(), ConsentPurpose.PROFILE_STORAGE)) {
                alert.disable();
                continue;
            }
            Optional<User> user = users.findById(alert.getUserId());
            Optional<Profile> profile = profiles.findById(alert.getUserId());
            if (user.isEmpty() || profile.isEmpty()) {
                continue;
            }
            checked++;
            Instant since = alert.getLastRunAt() != null ? alert.getLastRunAt() : now.minus(Duration.ofHours(props.alerts().lookbackHoursFirstRun()));
            ProfileView view = view(profile.get());
            List<AlertMailer.Item> items = new ArrayList<>();
            for (Job job : jobs) {
                Optional<SourceRef> source = job.sources() == null ? Optional.empty() : job.sources().stream().filter(SourceRef::allowInAlerts).findFirst();
                if (source.isEmpty() || job.firstSeenAt() == null || !Instant.parse(job.firstSeenAt()).isAfter(since)) {
                    continue;
                }
                Scorer.Result result = scorer.score(job, view, now);
                if (result.total() >= alert.getMinScore()) {
                    String where = "remote".equals(job.modality()) ? "remoto" : Optional.ofNullable(job.location()).map(l -> l.city()).orElse("Ecuador");
                    String url = source.get().applyUrl() != null ? source.get().applyUrl() : source.get().url();
                    items.add(new AlertMailer.Item(job.title(), job.company().name(), where, result.total(), props.siteUrl() + "/vacante/" + job.id(), url, source.get().sourceName()));
                }
            }
            items.sort(Comparator.comparingDouble(AlertMailer.Item::score).reversed());
            List<AlertMailer.Item> top = items.stream().limit(props.alerts().maxJobsPerEmail()).toList();
            boolean delivered = false;
            if (!top.isEmpty()) {
                try {
                    mailer.send(user.get().getEmail(), top);
                    delivered = true;
                    sent++;
                    audit.record(alert.getUserId(), "ALERT_SENT", top.size() + " vacantes");
                } catch (RuntimeException e) {
                    log.warn("No se pudo enviar una alerta: {}", e.getMessage());
                }
            }
            alert.recordRun(version, delivered);
        }
        return new AlertRunSummary(version, checked, sent, jobs.size());
    }

    private ProfileView view(Profile p) {
        List<ProfileSkill> list = skills.findByUserIdOrderBySkillIdAsc(p.getUserId()).stream().map(s -> new ProfileSkill(s.getSkillId(), s.getOrigin() == SkillOrigin.DEMONSTRATED)).toList();
        return new ProfileView(list, p.getYearsOfExperience() == null ? null : p.getYearsOfExperience().doubleValue(), p.getEnglishLevel(), p.getHomeCity(), p.isAcceptsRelocation(), p.getMinSalaryUsd(), p.getWeights());
    }
}
