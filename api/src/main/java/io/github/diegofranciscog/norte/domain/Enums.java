package io.github.diegofranciscog.norte.domain;

/** Catálogos cerrados del dominio. Se guardan como texto y la base los restringe con CHECK. */
public final class Enums {

    private Enums() {
    }

    public enum ConsentPurpose {
        PROFILE_STORAGE,
        EMAIL_ALERTS
    }

    public enum SkillOrigin {
        DEMONSTRATED,
        DECLARED
    }

    public enum ApplicationStatus {
        SAVED,
        APPLIED,
        REPLIED,
        INTERVIEW,
        OFFER,
        REJECTED
    }
}
