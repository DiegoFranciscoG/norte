package io.github.diegofranciscog.norte.repository;

import io.github.diegofranciscog.norte.domain.Profile;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProfileRepository extends JpaRepository<Profile, UUID> {
}
