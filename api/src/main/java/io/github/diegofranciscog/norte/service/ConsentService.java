package io.github.diegofranciscog.norte.service;

import io.github.diegofranciscog.norte.domain.Consent;
import io.github.diegofranciscog.norte.domain.ConsentText;
import io.github.diegofranciscog.norte.domain.Enums.ConsentPurpose;
import io.github.diegofranciscog.norte.dto.AccountDtos.ConsentStateResponse;
import io.github.diegofranciscog.norte.dto.AccountDtos.ConsentTextResponse;
import io.github.diegofranciscog.norte.exception.ApiException;
import io.github.diegofranciscog.norte.repository.ConsentRepository;
import io.github.diegofranciscog.norte.repository.ConsentTextRepository;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Consentimiento por finalidad (LOPDP): explícito, separado, versionado y revocable. */
@Service
public class ConsentService {

    private final ConsentRepository consents;
    private final ConsentTextRepository texts;
    private final AuditService audit;

    public ConsentService(ConsentRepository consents, ConsentTextRepository texts, AuditService audit) {
        this.consents = consents;
        this.texts = texts;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<ConsentTextResponse> currentTexts() {
        return texts.findByCurrentTrueOrderByPurposeAsc().stream().map(t -> new ConsentTextResponse(t.getPurpose(), t.getVersion(), t.getText())).toList();
    }

    @Transactional(readOnly = true)
    public List<ConsentStateResponse> states(UUID userId) {
        return Arrays.stream(ConsentPurpose.values()).map(purpose -> consents.findFirstByUserIdAndPurposeOrderByDecidedAtDesc(userId, purpose)
                .map(c -> new ConsentStateResponse(purpose, c.isGranted(), c.getTextVersion(), c.isGranted() ? c.getDecidedAt() : null))
                .orElseGet(() -> new ConsentStateResponse(purpose, false, currentVersion(purpose), null))).toList();
    }

    @Transactional(readOnly = true)
    public boolean isGranted(UUID userId, ConsentPurpose purpose) {
        return consents.findFirstByUserIdAndPurposeOrderByDecidedAtDesc(userId, purpose).map(Consent::isGranted).orElse(false);
    }

    @Transactional(readOnly = true)
    public void require(UUID userId, ConsentPurpose purpose) {
        if (!isGranted(userId, purpose)) {
            throw ApiException.consentRequired(purpose.name());
        }
    }

    /** Registra la decisión. Solo se acepta la versión vigente del texto: nadie consiente un texto que no vio. */
    @Transactional
    public void decide(UUID userId, ConsentPurpose purpose, boolean granted, String textVersion) {
        String current = currentVersion(purpose);
        if (granted && !current.equals(textVersion)) {
            throw ApiException.badRequest("consent-version", "El texto de consentimiento cambió; vuelve a leerlo antes de aceptar.");
        }
        consents.save(new Consent(userId, purpose, granted ? textVersion : current, granted));
        audit.record(userId, granted ? "CONSENT_GRANTED" : "CONSENT_REVOKED", purpose.name());
    }

    private String currentVersion(ConsentPurpose purpose) {
        return texts.findByPurposeAndCurrentTrue(purpose).map(ConsentText::getVersion)
                .orElseThrow(() -> new IllegalStateException("Sin texto vigente para " + purpose));
    }
}
