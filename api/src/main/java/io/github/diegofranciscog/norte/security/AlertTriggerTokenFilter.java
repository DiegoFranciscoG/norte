package io.github.diegofranciscog.norte.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Compara el token compartido en tiempo constante; si coincide, autentica la llamada como «alerts-trigger». */
class AlertTriggerTokenFilter extends OncePerRequestFilter {

    private final byte[] expected;

    AlertTriggerTokenFilter(String token) {
        if (token == null || token.length() < 32) {
            throw new IllegalStateException("ALERTS_TRIGGER_TOKEN debe tener al menos 32 caracteres. Genera uno con: openssl rand -hex 32");
        }
        this.expected = token.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            byte[] given = header.substring(7).trim().getBytes(StandardCharsets.UTF_8);
            if (MessageDigest.isEqual(expected, given)) {
                var auth = new UsernamePasswordAuthenticationToken("alerts-trigger", null, List.of(new SimpleGrantedAuthority("ROLE_ALERTS_TRIGGER")));
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }
        chain.doFilter(request, response);
    }
}
