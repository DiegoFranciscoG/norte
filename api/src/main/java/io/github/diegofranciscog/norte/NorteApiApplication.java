package io.github.diegofranciscog.norte;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class NorteApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(NorteApiApplication.class, args);
    }
}
