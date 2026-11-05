package io.github.diegofranciscog.norte.exception;

import jakarta.validation.ConstraintViolationException;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Errores como RFC 9457 (ProblemDetail), siempre en español y sin trazas internas:
 * el detalle técnico queda en el log del servidor, nunca en la respuesta.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(status, detail);
        p.setType(URI.create("urn:norte:problema:" + code));
        p.setTitle(status.getReasonPhrase());
        p.setProperty("code", code);
        return p;
    }

    @ExceptionHandler(TooManyRequestsException.class)
    ResponseEntity<ProblemDetail> tooMany(TooManyRequestsException ex) {
        return ResponseEntity.status(ex.getStatus())
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .body(problem(ex.getStatus(), ex.getCode(), ex.getMessage()));
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> api(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(problem(ex.getStatus(), ex.getCode(), ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> invalid(MethodArgumentNotValidException ex) {
        ProblemDetail p = problem(HttpStatus.BAD_REQUEST, "validation", "Hay datos inválidos en la solicitud.");
        List<Map<String, String>> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> Map.of("field", e.getField(), "message", e.getDefaultMessage() == null ? "inválido" : e.getDefaultMessage()))
                .toList();
        p.setProperty("errors", errors);
        return ResponseEntity.badRequest().body(p);
    }

    /** Validación de parámetros y de listas en el cuerpo (validación de métodos integrada en Spring MVC). */
    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ProblemDetail> methodValidation(HandlerMethodValidationException ex) {
        return ResponseEntity.badRequest().body(problem(HttpStatus.BAD_REQUEST, "validation", "Hay datos inválidos en la solicitud."));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ProblemDetail> constraint(ConstraintViolationException ex) {
        return ResponseEntity.badRequest().body(problem(HttpStatus.BAD_REQUEST, "validation", "Hay datos inválidos en la solicitud."));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<ProblemDetail> unreadable(Exception ex) {
        return ResponseEntity.badRequest().body(problem(HttpStatus.BAD_REQUEST, "malformed", "La solicitud no tiene el formato esperado."));
    }

    /** Dos peticiones a la vez, como un doble clic al registrarse. No se registra el detalle: PostgreSQL incluye los valores, como el correo. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ProblemDetail> conflict(DataIntegrityViolationException ex) {
        log.warn("Conflicto de datos ({})", ex.getClass().getSimpleName());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(problem(HttpStatus.CONFLICT, "conflict", "La operación entra en conflicto con datos existentes."));
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ProblemDetail> denied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(problem(HttpStatus.FORBIDDEN, "forbidden", "No tienes permiso para esta operación."));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ProblemDetail> method(HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(problem(HttpStatus.METHOD_NOT_ALLOWED, "method-not-allowed", "Método no permitido."));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ProblemDetail> notFound(NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(problem(HttpStatus.NOT_FOUND, "not-found", "Recurso no encontrado."));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> unexpected(Exception ex) {
        if (ex instanceof ErrorResponse er && er.getStatusCode().is4xxClientError()) {
            // Errores de la solicitud que detecta el framework (415, 406, parámetro faltante…): siguen siendo 4xx y sin detalles internos.
            HttpStatus status = HttpStatus.valueOf(er.getStatusCode().value());
            return ResponseEntity.status(status).body(problem(status, "bad-request", "La solicitud no se pudo procesar."));
        }
        log.error("Error no controlado", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(problem(HttpStatus.INTERNAL_SERVER_ERROR, "internal", "Ocurrió un error interno. Intenta de nuevo más tarde."));
    }
}
