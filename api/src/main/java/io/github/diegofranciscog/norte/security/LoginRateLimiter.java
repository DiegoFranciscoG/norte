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
 * Ventana deslizante en memoria por IP y por correo: frena la fuerza bruta sobre el login y el registro.
 * Con una sola instancia (plan gratuito) basta; con varias habría que moverlo a Redis.
 */
@Component
public class LoginRateLimiter {

    private final int maxAttempts;
    private final Duration window;
    private final Clock clock;
    private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();

    @Autowired
    public LoginRateLimiter(NorteProperties props) {
        this(props.rateLimit().maxAttempts(), props.rateLimit().window(), Clock.systemUTC());
    }

    LoginRateLimiter(int maxAttempts, Duration window, Clock clock) {
        this.maxAttempts = maxAttempts;
        this.window = window;
        this.clock = clock;
    }

    /** Lanza 429 si la IP o el correo superaron el máximo de intentos dentro de la ventana. */
    public void check(String ip, String email) {
        Instant now = clock.instant();
        for (String key : keys(ip, email)) {
            Deque<Instant> q = attempts.computeIfAbsent(key, k -> new ArrayDeque<>());
            synchronized (q) {
                prune(q, now);
                if (q.size() >= maxAttempts) {
                    long retry = Math.max(1, Duration.between(now, q.peekFirst().plus(window)).toSeconds());
                    throw new TooManyRequestsException(retry);
                }
            }
        }
    }

    public void recordFailure(String ip, String email) {
        Instant now = clock.instant();
        for (String key : keys(ip, email)) {
            Deque<Instant> q = attempts.computeIfAbsent(key, k -> new ArrayDeque<>());
            synchronized (q) {
                prune(q, now);
                q.addLast(now);
            }
        }
    }

    public void reset(String email) {
        attempts.remove("email:" + normalize(email));
    }

    private void prune(Deque<Instant> q, Instant now) {
        while (!q.isEmpty() && q.peekFirst().isBefore(now.minus(window))) {
            q.pollFirst();
        }
    }

    private static String[] keys(String ip, String email) {
        return new String[] {"ip:" + ip, "email:" + normalize(email)};
    }

    private static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
