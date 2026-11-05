package io.github.diegofranciscog.norte.security;

import io.github.diegofranciscog.norte.config.NorteProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * IP con la que se cuentan los intentos. La cabecera solo se usa si se configuró, es decir, si hay un proxy de confianza
 * que la sobrescribe siempre; de lo contrario, cualquiera podría cambiar de IP en cada intento.
 */
@Component
public class ClientIpResolver {

    /** Longitud máxima de una IPv6 escrita: evita usar textos arbitrarios como clave. */
    private static final int MAX_IP_LENGTH = 45;

    private final String header;

    @Autowired
    public ClientIpResolver(NorteProperties props) {
        this(props.rateLimit().clientIpHeader());
    }

    ClientIpResolver(String header) {
        this.header = header;
    }

    public String resolve(HttpServletRequest request) {
        if (header != null && !header.isBlank()) {
            String value = request.getHeader(header);
            if (value != null && !value.isBlank() && value.strip().length() <= MAX_IP_LENGTH) {
                return value.strip();
            }
        }
        return request.getRemoteAddr();
    }
}
