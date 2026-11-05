package io.github.diegofranciscog.norte.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientIpResolverTest {

    private static MockHttpServletRequest request(String headerValue) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.9");
        if (headerValue != null) {
            request.addHeader("CF-Connecting-IP", headerValue);
        }
        return request;
    }

    @Test
    void sinCabeceraConfiguradaNoLeCreeAlVisitante() {
        assertThat(new ClientIpResolver("").resolve(request("203.0.113.7"))).isEqualTo("10.0.0.9");
        assertThat(new ClientIpResolver((String) null).resolve(request("203.0.113.7"))).isEqualTo("10.0.0.9");
    }

    @Test
    void conCabeceraConfiguradaUsaLaIpQueDaElProxy() {
        assertThat(new ClientIpResolver("CF-Connecting-IP").resolve(request(" 203.0.113.7 "))).isEqualTo("203.0.113.7");
    }

    @Test
    void siLaCabeceraFaltaOTraeOtraCosaUsaLaConexion() {
        ClientIpResolver resolver = new ClientIpResolver("CF-Connecting-IP");
        assertThat(resolver.resolve(request(null))).isEqualTo("10.0.0.9");
        assertThat(resolver.resolve(request("  "))).isEqualTo("10.0.0.9");
        assertThat(resolver.resolve(request("x".repeat(46)))).isEqualTo("10.0.0.9");
    }
}
