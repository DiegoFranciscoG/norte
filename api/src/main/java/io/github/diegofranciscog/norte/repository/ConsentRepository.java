package io.github.diegofranciscog.norte.repository;

import io.github.diegofranciscog.norte.domain.Consent;
import io.github.diegofranciscog.norte.domain.Enums.ConsentPurpose;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsentRepository extends JpaRepository<Consent, UUID> {

    Optional<Consent> findFirstByUserIdAndPurposeOrderByDecidedAtDesc(UUID userId, ConsentPurpose purpose);

    List<Consent> findByUserIdOrderByDecidedAtAsc(UUID userId);
}
