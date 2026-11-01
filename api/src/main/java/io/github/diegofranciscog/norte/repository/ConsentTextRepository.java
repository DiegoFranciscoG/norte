package io.github.diegofranciscog.norte.repository;

import io.github.diegofranciscog.norte.domain.ConsentText;
import io.github.diegofranciscog.norte.domain.Enums.ConsentPurpose;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsentTextRepository extends JpaRepository<ConsentText, ConsentText.Key> {

    List<ConsentText> findByCurrentTrueOrderByPurposeAsc();

    Optional<ConsentText> findByPurposeAndCurrentTrue(ConsentPurpose purpose);
}
