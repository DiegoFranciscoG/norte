package io.github.diegofranciscog.norte.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.diegofranciscog.norte.exception.TooManyRequestsException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class LoginRateLimiterTest {

    /** Reloj manual para mover el tiempo sin esperar. */
    static final class ManualClock extends Clock {
        private Instant now = Instant.parse("2026-10-31T12:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private final ManualClock clock = new ManualClock();
    private final LoginRateLimiter limiter = new LoginRateLimiter(3, 5, Duration.ofMinutes(15), clock);

    @Test
    void bloqueaTrasElMaximoDeFallosEIndicaCuantoEsperar() {
        for (int i = 0; i < 3; i++) {
            limiter.check("10.0.0.1", "ana@example.com");
            limiter.recordFailure("10.0.0.1", "ana@example.com");
        }
        assertThatThrownBy(() -> limiter.check("10.0.0.1", "ana@example.com"))
                .isInstanceOfSatisfying(TooManyRequestsException.class, e -> assertThat(e.getRetryAfterSeconds()).isBetween(1L, 900L));
    }

    @Test
    void laVentanaSeDesliza() {
        for (int i = 0; i < 3; i++) {
            limiter.recordFailure("10.0.0.1", "ana@example.com");
        }
        clock.advance(Duration.ofMinutes(16));
        assertThatCode(() -> limiter.check("10.0.0.1", "ana@example.com")).doesNotThrowAnyException();
    }

    @Test
    void cuentaPorCorreoAunqueCambieLaIp() {
        for (int i = 0; i < 3; i++) {
            limiter.recordFailure("10.0.0.1", "Ana@Example.com ");
        }
        assertThatThrownBy(() -> limiter.check("10.0.0.2", "ana@example.com")).isInstanceOf(TooManyRequestsException.class);

        limiter.reset("ana@example.com");
        assertThatCode(() -> limiter.check("10.0.0.2", "ana@example.com")).doesNotThrowAnyException();
    }

    @Test
    void unaIpTieneUnLimiteMasHolgadoPorqueUnaRedEnteraPuedeCompartirla() {
        for (int i = 0; i < 4; i++) {
            limiter.recordFailure("10.0.0.1", "persona" + i + "@example.com");
        }
        assertThatCode(() -> limiter.check("10.0.0.1", "otra@example.com")).doesNotThrowAnyException();
        limiter.recordFailure("10.0.0.1", "persona4@example.com");
        assertThatThrownBy(() -> limiter.check("10.0.0.1", "otra@example.com")).isInstanceOf(TooManyRequestsException.class);
        assertThatCode(() -> limiter.check("10.0.0.2", "otra@example.com")).doesNotThrowAnyException();
    }

    @Test
    void lasCuentasNuevasCuentanContraLaIpPeroNoContraElCorreo() {
        for (int i = 0; i < 5; i++) {
            limiter.recordAttempt("10.0.0.1");
        }
        assertThatThrownBy(() -> limiter.check("10.0.0.1", "ana@example.com")).isInstanceOf(TooManyRequestsException.class);
        assertThatCode(() -> limiter.check("10.0.0.2", "ana@example.com")).doesNotThrowAnyException();
    }

    @Test
    void olvidaLoVencidoParaNoCrecerSinLimite() {
        for (int i = 0; i < 100; i++) {
            limiter.recordFailure("10.0." + i + ".1", "persona" + i + "@example.com");
        }
        assertThat(limiter.trackedKeys()).isEqualTo(200);
        clock.advance(Duration.ofMinutes(16));
        limiter.check("10.0.0.9", "ana@example.com");
        assertThat(limiter.trackedKeys()).isZero();
    }
}
