package io.github.diegofranciscog.norte.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;

class GlobalExceptionHandlerTest {

    @Test
    void unConflictoDeDatosResponde409SinRepetirLosValores() {
        ResponseEntity<ProblemDetail> response = new GlobalExceptionHandler()
                .conflict(new DataIntegrityViolationException("duplicate key value: Key (email)=(ana@example.com) already exists"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().getDetail()).doesNotContain("ana@example.com");
        assertThat(response.getBody().getProperties()).containsEntry("code", "conflict");
    }
}
