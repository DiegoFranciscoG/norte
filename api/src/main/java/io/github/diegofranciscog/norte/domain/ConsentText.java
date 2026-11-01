package io.github.diegofranciscog.norte.domain;

import io.github.diegofranciscog.norte.domain.Enums.ConsentPurpose;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.LocalDate;

@Entity
@Table(name = "consent_texts")
@IdClass(ConsentText.Key.class)
public class ConsentText {

    public static class Key implements Serializable {
        private ConsentPurpose purpose;
        private String version;

        public Key() {
        }

        public Key(ConsentPurpose purpose, String version) {
            this.purpose = purpose;
            this.version = version;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && k.purpose == purpose && java.util.Objects.equals(k.version, version);
        }

        @Override
        public int hashCode() {
            return java.util.Objects.hash(purpose, version);
        }
    }

    @Id
    @Enumerated(EnumType.STRING)
    @Column(length = 40)
    private ConsentPurpose purpose;

    @Id
    @Column(length = 20)
    private String version;

    @Column(nullable = false, length = 2000)
    private String text;

    @Column(name = "published_at", nullable = false)
    private LocalDate publishedAt;

    @Column(name = "is_current", nullable = false)
    private boolean current;

    protected ConsentText() {
    }

    public ConsentPurpose getPurpose() {
        return purpose;
    }

    public String getVersion() {
        return version;
    }

    public String getText() {
        return text;
    }

    public LocalDate getPublishedAt() {
        return publishedAt;
    }

    public boolean isCurrent() {
        return current;
    }
}
