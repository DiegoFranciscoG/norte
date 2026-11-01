package io.github.diegofranciscog.norte.repository;

import io.github.diegofranciscog.norte.domain.Application;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApplicationRepository extends JpaRepository<Application, UUID> {

    List<Application> findByUserIdOrderByUpdatedAtDesc(UUID userId);

    Optional<Application> findByIdAndUserId(UUID id, UUID userId);

    Optional<Application> findByUserIdAndJobId(UUID userId, String jobId);
}
