package io.github.diegofranciscog.norte.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI norteOpenApi() {
        return new OpenAPI()
                .info(new Info().title("NORTE API").version("0.1.0")
                        .description("API privada de NORTE: cuenta, perfil (solo identificadores de habilidades), postulaciones, alertas y derechos LOPDP. La búsqueda y el observatorio no usan esta API: leen el índice estático.")
                        .license(new License().name("MIT")))
                .components(new Components().addSecuritySchemes("bearer", new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")));
    }
}
