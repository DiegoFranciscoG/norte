package io.github.diegofranciscog.norte.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.github.diegofranciscog.norte.config.NorteProperties;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.javamail.JavaMailSender;

class AlertMailerTest {

    private static NorteProperties props() {
        return new NorteProperties(new NorteProperties.Jwt("no-se-usa-en-esta-prueba", "norte-api", Duration.ofMinutes(15), Duration.ofDays(7)),
                List.of("http://localhost:4200"), new NorteProperties.Alerts("no-se-usa-en-esta-prueba-tampoco-0000", "alertas@norte.test", 10, 72),
                "http://localhost:8080/data/v1", "https://norte.example", new NorteProperties.RateLimit(5, 20, Duration.ofMinutes(15), null));
    }

    private static void collectText(Part part, List<String> out) throws Exception {
        Object content = part.getContent();
        if (content instanceof String s) {
            out.add(s);
        } else if (content instanceof Multipart mp) {
            for (int i = 0; i < mp.getCount(); i++) {
                collectText(mp.getBodyPart(i), out);
            }
        }
    }

    @Test
    void enviaTextoYHtmlEscapadoConEnlaceALaFuenteYParaDesactivar() throws Exception {
        JavaMailSender sender = mock(JavaMailSender.class);
        when(sender.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        AlertMailer mailer = new AlertMailer(sender, props());

        mailer.send("ana@example.com", List.of(new AlertMailer.Item("Backend <script>alert(1)</script>", "Ficticia S.A.", "remoto", 87.4,
                "https://norte.example/vacante/j_1", "https://boards.greenhouse.io/ficticia/jobs/1", "Greenhouse")));

        ArgumentCaptor<MimeMessage> sent = ArgumentCaptor.forClass(MimeMessage.class);
        verify(sender).send(sent.capture());
        MimeMessage message = sent.getValue();
        assertThat(message.getSubject()).isEqualTo("NORTE: 1 vacante nueva que encaja contigo");
        assertThat(message.getAllRecipients()).extracting(Object::toString).containsExactly("ana@example.com");

        List<String> parts = new ArrayList<>();
        collectText(message, parts);
        String text = parts.stream().filter(p -> !p.contains("<ul>")).findFirst().orElseThrow();
        String html = parts.stream().filter(p -> p.contains("<ul>")).findFirst().orElseThrow();
        assertThat(text).contains("encaje 87/100", "Fuente: Greenhouse https://boards.greenhouse.io/ficticia/jobs/1", "https://norte.example/cuenta");
        assertThat(html).contains("&lt;script&gt;").doesNotContain("<script>");
    }
}
