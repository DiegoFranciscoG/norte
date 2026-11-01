package io.github.diegofranciscog.norte.repository;

import io.github.diegofranciscog.norte.domain.ProfileSkill;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProfileSkillRepository extends JpaRepository<ProfileSkill, UUID> {

    List<ProfileSkill> findByUserIdOrderBySkillIdAsc(UUID userId);

    @Modifying
    @Query("DELETE FROM ProfileSkill s WHERE s.userId = :userId")
    int deleteByUser(@Param("userId") UUID userId);
}
