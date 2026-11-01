package io.github.diegofranciscog.norte.security;

import io.github.diegofranciscog.norte.config.NorteProperties;
import io.github.diegofranciscog.norte.repository.UserRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/** Deny-by-default: solo lo listado aquí es público; todo lo demás exige un JWT válido. */
@Configuration
public class SecurityConfig {

    private static final String CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

    @Bean
    PasswordEncoder passwordEncoder() {
        return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    }

    private static void hardening(HttpSecurity http) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(h -> h
                        .contentSecurityPolicy(c -> c.policyDirectives(CSP))
                        .referrerPolicy(r -> r.policy(ReferrerPolicy.NO_REFERRER))
                        .frameOptions(f -> f.deny())
                        .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31_536_000)));
    }

    /** Disparo de alertas desde GitHub Actions: protegido por un secreto compartido, no por JWT de usuario. */
    @Bean
    @Order(1)
    SecurityFilterChain internalChain(HttpSecurity http, NorteProperties props) throws Exception {
        hardening(http);
        http.securityMatcher("/api/internal/**")
                .addFilterBefore(new AlertTriggerTokenFilter(props.alerts().triggerToken()), UsernamePasswordAuthenticationFilter.class)
                .authorizeHttpRequests(a -> a.anyRequest().authenticated())
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain apiChain(HttpSecurity http, UserRepository users) throws Exception {
        hardening(http);
        http.cors(Customizer.withDefaults())
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/consent-texts").permitAll()
                        .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/error").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(activeUser(users))))
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));
        return http.build();
    }

    /** Un token firmado no basta: la cuenta debe seguir existiendo (tras el borrado, sus tokens dejan de servir al instante). */
    static Converter<Jwt, AbstractAuthenticationToken> activeUser(UserRepository users) {
        JwtAuthenticationConverter delegate = new JwtAuthenticationConverter();
        return jwt -> {
            UUID id;
            try {
                id = UUID.fromString(jwt.getSubject());
            } catch (IllegalArgumentException | NullPointerException e) {
                throw new InvalidBearerTokenException("Token sin usuario válido");
            }
            if (!users.existsById(id)) {
                throw new InvalidBearerTokenException("La cuenta ya no existe");
            }
            return delegate.convert(jwt);
        };
    }

    /** CORS con orígenes explícitos desde el entorno; nunca comodín. */
    @Bean
    CorsConfigurationSource corsConfigurationSource(NorteProperties props) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(props.corsAllowedOrigins().stream().map(String::trim).filter(o -> !o.isEmpty() && !o.equals("*")).toList());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        cors.setExposedHeaders(List.of("Retry-After"));
        cors.setAllowCredentials(false);
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cors);
        return source;
    }
}
