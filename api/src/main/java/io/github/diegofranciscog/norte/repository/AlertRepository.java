package io.github.diegofranciscog.norte.repository;

import io.github.diegofranciscog.norte.domain.Alert;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AlertRepository extends JpaRepository<Alert, UUID> {

    List<Alert> findByEnabledTrue();
}
