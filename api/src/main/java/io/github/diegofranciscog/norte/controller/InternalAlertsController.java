package io.github.diegofranciscog.norte.controller;

import io.github.diegofranciscog.norte.dto.AccountDtos.AlertRunSummary;
import io.github.diegofranciscog.norte.service.AlertService;
import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** Lo llama GitHub Actions al publicar un índice nuevo (con el secreto compartido). */
@Hidden
@RestController
public class InternalAlertsController {

    private final AlertService alerts;

    public InternalAlertsController(AlertService alerts) {
        this.alerts = alerts;
    }

    @PostMapping("/api/internal/alerts/run")
    public AlertRunSummary run() {
        return alerts.run();
    }
}
