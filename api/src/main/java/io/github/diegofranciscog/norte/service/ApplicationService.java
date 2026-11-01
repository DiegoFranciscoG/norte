package io.github.diegofranciscog.norte.service;

import io.github.diegofranciscog.norte.domain.Application;
import io.github.diegofranciscog.norte.domain.ApplicationEvent;
import io.github.diegofranciscog.norte.domain.Enums.ApplicationStatus;
import io.github.diegofranciscog.norte.dto.ApplicationDtos.ApplicationRequest;
import io.github.diegofranciscog.norte.dto.ApplicationDtos.ApplicationResponse;
import io.github.diegofranciscog.norte.exception.ApiException;
import io.github.diegofranciscog.norte.mapper.DtoMapper;
import io.github.diegofranciscog.norte.repository.ApplicationEventRepository;
import io.github.diegofranciscog.norte.repository.ApplicationRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Seguimiento de postulaciones con historial de estados. Cada persona solo ve y toca las suyas. */
@Service
public class ApplicationService {

    private final ApplicationRepository applications;
    private final ApplicationEventRepository events;

    public ApplicationService(ApplicationRepository applications, ApplicationEventRepository events) {
        this.applications = applications;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<ApplicationResponse> list(UUID userId) {
        List<Application> all = applications.findByUserIdOrderByUpdatedAtDesc(userId);
        List<ApplicationEvent> history = all.isEmpty() ? List.of() : events.findByApplicationIdInOrderByChangedAtAsc(all.stream().map(Application::getId).toList());
        return all.stream().map(a -> DtoMapper.toResponse(a, history)).toList();
    }

    @Transactional
    public ApplicationResponse create(UUID userId, ApplicationRequest req) {
        if (applications.findByUserIdAndJobId(userId, req.jobId()).isPresent()) {
            throw ApiException.conflict("already-saved", "Ya guardaste esta vacante.");
        }
        Application app = applications.save(new Application(userId, req.jobId(), req.jobTitle(), req.company(), req.jobUrl()));
        events.save(new ApplicationEvent(app.getId(), ApplicationStatus.SAVED));
        if (req.status() != null && req.status() != ApplicationStatus.SAVED || req.notes() != null || req.followUpAt() != null || req.appliedAt() != null) {
            applyChanges(app, req);
        }
        return DtoMapper.toResponse(app, events.findByApplicationIdInOrderByChangedAtAsc(List.of(app.getId())));
    }

    @Transactional
    public ApplicationResponse update(UUID userId, UUID id, ApplicationRequest req) {
        Application app = applications.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("La postulación"));
        applyChanges(app, req);
        return DtoMapper.toResponse(app, events.findByApplicationIdInOrderByChangedAtAsc(List.of(app.getId())));
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        Application app = applications.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("La postulación"));
        applications.delete(app);
    }

    private void applyChanges(Application app, ApplicationRequest req) {
        boolean changed = app.update(req.jobTitle(), req.company(), req.jobUrl(), req.status(), req.appliedAt(), req.followUpAt(), req.notes());
        if (changed) {
            events.save(new ApplicationEvent(app.getId(), app.getStatus()));
        }
    }
}
