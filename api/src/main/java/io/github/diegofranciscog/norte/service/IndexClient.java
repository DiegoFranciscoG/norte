package io.github.diegofranciscog.norte.service;

import io.github.diegofranciscog.norte.config.NorteProperties;
import io.github.diegofranciscog.norte.scoring.IndexModels.GeoFile;
import io.github.diegofranciscog.norte.scoring.IndexModels.IndexInfo;
import io.github.diegofranciscog.norte.scoring.IndexModels.JobsFile;
import io.github.diegofranciscog.norte.scoring.IndexModels.ScoringConfig;
import io.github.diegofranciscog.norte.scoring.IndexModels.SkillsFile;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** Lee el índice estático publicado por la ingesta (GitHub Pages). Es público: no lleva credenciales. */
@Component
public class IndexClient {

    private final RestClient http;

    public IndexClient(RestClient.Builder builder, NorteProperties props) {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NORMAL).build());
        factory.setReadTimeout(Duration.ofSeconds(30));
        this.http = builder.baseUrl(props.indexBaseUrl().replaceAll("/+$", "")).requestFactory(factory).build();
    }

    public IndexInfo index() {
        return http.get().uri("/index.json").retrieve().body(IndexInfo.class);
    }

    public JobsFile jobs() {
        return http.get().uri("/jobs.json").retrieve().body(JobsFile.class);
    }

    public SkillsFile skills() {
        return http.get().uri("/skills.json").retrieve().body(SkillsFile.class);
    }

    public GeoFile geo() {
        return http.get().uri("/geo.json").retrieve().body(GeoFile.class);
    }

    public ScoringConfig scoring() {
        return http.get().uri("/scoring.json").retrieve().body(ScoringConfig.class);
    }
}
