package io.github.diegofranciscog.norte.controller;

import io.github.diegofranciscog.norte.domain.Enums.ConsentPurpose;
import io.github.diegofranciscog.norte.dto.AccountDtos.AlertSettings;
import io.github.diegofranciscog.norte.dto.AccountDtos.ConsentStateResponse;
import io.github.diegofranciscog.norte.dto.AccountDtos.ConsentUpdateRequest;
import io.github.diegofranciscog.norte.dto.AccountDtos.DeleteAccountRequest;
import io.github.diegofranciscog.norte.dto.AccountDtos.ExportResponse;
import io.github.diegofranciscog.norte.dto.ProfileDtos.ProfileRequest;
import io.github.diegofranciscog.norte.dto.ProfileDtos.ProfileResponse;
import io.github.diegofranciscog.norte.dto.ProfileDtos.RepoItem;
import io.github.diegofranciscog.norte.dto.ProfileDtos.SkillItem;
import io.github.diegofranciscog.norte.service.AccountService;
import io.github.diegofranciscog.norte.service.ConsentService;
import io.github.diegofranciscog.norte.service.ProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
@SecurityRequirement(name = "bearer")
@Tag(name = "Mi cuenta", description = "Perfil, consentimientos, alertas y derechos del titular")
public class MeController {

    private final ProfileService profiles;
    private final ConsentService consents;
    private final AccountService accounts;

    public MeController(ProfileService profiles, ConsentService consents, AccountService accounts) {
        this.profiles = profiles;
        this.consents = consents;
        this.accounts = accounts;
    }

    static UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    @GetMapping("/profile")
    public ProfileResponse profile(@AuthenticationPrincipal Jwt jwt) {
        return profiles.get(userId(jwt));
    }

    @PutMapping("/profile")
    @Operation(summary = "Guardar preferencias (requiere consentimiento PROFILE_STORAGE)")
    public ProfileResponse updateProfile(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProfileRequest req) {
        return profiles.update(userId(jwt), req);
    }

    @GetMapping("/skills")
    public List<SkillItem> skills(@AuthenticationPrincipal Jwt jwt) {
        return profiles.skills(userId(jwt));
    }

    @PutMapping("/skills")
    @Operation(summary = "Reemplazar habilidades: solo identificadores y origen, nunca el CV")
    public List<SkillItem> replaceSkills(@AuthenticationPrincipal Jwt jwt, @RequestBody @Size(max = 400) List<@Valid SkillItem> items) {
        return profiles.replaceSkills(userId(jwt), items);
    }

    @GetMapping("/repos")
    public List<RepoItem> repos(@AuthenticationPrincipal Jwt jwt) {
        return profiles.repos(userId(jwt));
    }

    @PutMapping("/repos")
    public List<RepoItem> replaceRepos(@AuthenticationPrincipal Jwt jwt, @RequestBody @Size(max = 50) List<@Valid RepoItem> items) {
        return profiles.replaceRepos(userId(jwt), items);
    }

    @GetMapping("/consents")
    public List<ConsentStateResponse> consents(@AuthenticationPrincipal Jwt jwt) {
        return consents.states(userId(jwt));
    }

    @PutMapping("/consents/{purpose}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Otorgar o retirar un consentimiento; retirarlo borra los datos de esa finalidad")
    public void changeConsent(@AuthenticationPrincipal Jwt jwt, @PathVariable ConsentPurpose purpose, @Valid @RequestBody ConsentUpdateRequest req) {
        accounts.changeConsent(userId(jwt), purpose, req.granted(), req.textVersion());
    }

    @GetMapping("/alerts")
    public AlertSettings alerts(@AuthenticationPrincipal Jwt jwt) {
        return accounts.alertSettings(userId(jwt));
    }

    @PutMapping("/alerts")
    public AlertSettings updateAlerts(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AlertSettings settings) {
        return accounts.updateAlerts(userId(jwt), settings);
    }

    @GetMapping("/export")
    @Operation(summary = "Exportar todos mis datos en un archivo")
    public ResponseEntity<ExportResponse> export(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"norte-mis-datos.json\"").body(accounts.export(userId(jwt)));
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Borrar la cuenta de verdad: no queda ninguna fila del usuario")
    public void delete(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody DeleteAccountRequest req) {
        accounts.delete(userId(jwt), req.password());
    }
}
