package io.github.diegofranciscog.norte.service;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.diegofranciscog.norte.scoring.IndexModels.Company;
import io.github.diegofranciscog.norte.scoring.IndexModels.Job;
import io.github.diegofranciscog.norte.scoring.IndexModels.Location;
import java.util.List;
import org.junit.jupiter.api.Test;

class AlertServiceTest {

    private static Job job(String modality, Location location) {
        return new Job("j", "Cargo", new Company("Ficticia"), location, modality, null, null, null, List.of(), null, List.of(), null, null, "open", List.of());
    }

    @Test
    void elCorreoDiceDondeEsLaVacanteSinSuponerUnPais() {
        assertThat(AlertService.where(job("remote", new Location("Madrid", null, "ES")))).isEqualTo("remoto");
        assertThat(AlertService.where(job("onsite", new Location("Madrid", null, "ES")))).isEqualTo("Madrid");
        assertThat(AlertService.where(job("hybrid", new Location(null, null, "ES")))).isEqualTo("España");
        assertThat(AlertService.where(job("onsite", new Location(null, null, null)))).isEqualTo("ubicación no indicada");
        assertThat(AlertService.where(job("onsite", null))).isEqualTo("ubicación no indicada");
    }
}
