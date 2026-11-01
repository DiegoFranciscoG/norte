package io.github.diegofranciscog.norte.repository;

import io.github.diegofranciscog.norte.domain.ApplicationEvent;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApplicationEventRepository extends JpaRepository<ApplicationEvent, UUID> {

    List<ApplicationEvent> findByApplicationIdInOrderByChangedAtAsc(Collection<UUID> applicationIds);
}
