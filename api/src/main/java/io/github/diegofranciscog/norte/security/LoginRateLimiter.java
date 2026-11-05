package io.github.diegofranciscog.norte.security;

import io.github.diegofranciscog.norte.config.NorteProperties;
import io.github.diegofranciscog.norte.exception.TooManyRequestsException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Ventana deslizante en memoria: frena la fuerza bruta sobre el login y el registro. Por correo protege una cuenta;
 * por IP, con un límite más holgado porque una red entera puede compartirla, frena a quien prueba muchas cuentas o las crea en masa.
 * Con una sola instancia (plan gratuito) basta; con varias habría que moverlo a Redis.
 */
@Component
public class LoginRateLimiter {

    private final int maxPerEmail;
    private final int maxPerIp;
    private final Duration window;
    private final Clock clock;
    private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();
    private volatile Instant nextSweep;

    @Autowired
    public LoginRateLimiter(NorteProperties props) {
        this(props.rateLimit().maxAttempts(), props.rateLimit().maxAttemptsPerIp(), props.rateLimit().window(), Clock.systemUTC());
    }

    LoginRateLimiter(int maxPerEmail, int maxPerIp, Duration window, Clock clock) {
        this.maxPerEmail = maxPerEmail;
        this.maxPerIp = maxPerIp;
        this.window = window;
        this.clock = clock;
        this.nextSweep = clock.instant().plus(window);
    }

    /** Lanza 429 si la IP o el correo superaron su máximo de intentos dentro de la ventana. */
    public void check(String ip, String email) {
        Instant now = clock.instant();
        sweep(now);
        checkKey(ipKey(ip), maxPerIp, now);
        checkKey(emailKey(email), maxPerEmail, now);
    }

    public void recordFailure(String ip, String email) {
        Instant now = clock.instant();
        record(ipKey(ip), now);
        record(emailKey(email), now);
    }

    /** Cuenta contra la IP algo que no es un fallo, como crear una cuenta: limita la creación masiva. */
    public void recordAttempt(String ip) {
        record(ipKey(ip), clock.instant());
    }

    public void reset(String email) {
        attempts.remove(emailKey(email));
    }

    int trackedKeys() {
        return attempts.size();
    }

    private void checkKey(String key, int limit, Instant now) {
        Deque<Instant> q = attempts.get(key);
        if (q == null) {
            return;
        }
        synchronized (q) {
            prune(q, now);
            if (q.size() >= limit) {
                long retry = Math.max(1, Duration.between(now, q.peekFirst().plus(window)).toSeconds());
                throw new TooManyRequestsException(retry);
            }
        }
    }

    private void record(String key, Instant now) {
        attempts.compute(key, (k, existing) -> {
            Deque<Instant> q = existing == null ? new ArrayDeque<>() : existing;
            synchronized (q) {
                prune(q, now);
                q.addLast(now);
            }
            return q;
        });
    }

    /** Una vez por ventana olvida las claves vencidas: sin esto, correos inventados harían crecer la memoria sin límite. */
    private void sweep(Instant now) {
        if (now.isBefore(nextSweep)) {
            return;
        }
        nextSweep = now.plus(window);
        attempts.entrySet().removeIf(entry -> {
            Deque<Instant> q = entry.getValue();
            synchronized (q) {
                prune(q, now);
                return q.isEmpty();
            }
        });
    }

    private void prune(Deque<Instant> q, Instant now) {
        while (!q.isEmpty() && q.peekFirst().isBefore(now.minus(window))) {
            q.pollFirst();
        }
    }

    private static String ipKey(String ip) {
        return "ip:" + ip;
    }

    private static String emailKey(String email) {
        return "email:" + (email == null ? "" : email.trim().toLowerCase(Locale.ROOT));
    }
}
