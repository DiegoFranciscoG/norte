package io.github.diegofranciscog.norte.repository;

import io.github.diegofranciscog.norte.domain.AuditLog;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    List<AuditLog> findByUserIdOrderByAtAsc(UUID userId);

    List<AuditLog> findByUserIdIsNullAndAction(String action);
}
