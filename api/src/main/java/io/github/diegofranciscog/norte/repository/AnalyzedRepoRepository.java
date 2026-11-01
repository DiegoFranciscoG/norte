package io.github.diegofranciscog.norte.repository;

import io.github.diegofranciscog.norte.domain.AnalyzedRepo;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AnalyzedRepoRepository extends JpaRepository<AnalyzedRepo, UUID> {

    List<AnalyzedRepo> findByUserIdOrderByNameAsc(UUID userId);

    @Modifying
    @Query("DELETE FROM AnalyzedRepo r WHERE r.userId = :userId")
    int deleteByUser(@Param("userId") UUID userId);
}
