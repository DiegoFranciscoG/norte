package io.github.diegofranciscog.norte.domain;

import io.github.diegofranciscog.norte.domain.Enums.SkillOrigin;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Una habilidad del perfil: identificador del catálogo, URI ESCO si existe y su origen. Nunca texto del CV. */
@Entity
@Table(name = "profile_skills")
public class ProfileSkill {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "skill_id", nullable = false, length = 60)
    private String skillId;

    @Column(name = "esco_uri", length = 200)
    private String escoUri;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15)
    private SkillOrigin origin;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<String> repos;

    protected ProfileSkill() {
    }

    public ProfileSkill(UUID userId, String skillId, String escoUri, SkillOrigin origin, List<String> repos) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.skillId = skillId;
        this.escoUri = escoUri;
        this.origin = origin;
        this.repos = repos;
    }

    public String getSkillId() {
        return skillId;
    }

    public String getEscoUri() {
        return escoUri;
    }

    public SkillOrigin getOrigin() {
        return origin;
    }

    public List<String> getRepos() {
        return repos;
    }
}
