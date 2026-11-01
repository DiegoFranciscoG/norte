package io.github.diegofranciscog.norte.service;

import io.github.diegofranciscog.norte.config.NorteProperties;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.util.List;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/** Correo de alertas: texto plano y HTML mínimo, con enlace a la ficha en NORTE y a la fuente original. */
@Component
public class AlertMailer {

    public record Item(String title, String company, String where, double score, String jobUrl, String sourceUrl, String sourceName) {
    }

    private final JavaMailSender sender;
    private final NorteProperties props;

    public AlertMailer(JavaMailSender sender, NorteProperties props) {
        this.sender = sender;
        this.props = props;
    }

    public void send(String to, List<Item> items) {
        String subject = items.size() == 1 ? "NORTE: 1 vacante nueva que encaja contigo" : "NORTE: " + items.size() + " vacantes nuevas que encajan contigo";
        StringBuilder text = new StringBuilder("Vacantes nuevas sobre tu umbral:\n\n");
        StringBuilder html = new StringBuilder("<p>Vacantes nuevas sobre tu umbral:</p><ul>");
        for (Item i : items) {
            text.append("• ").append(i.title()).append(" — ").append(i.company()).append(" (").append(i.where()).append(") · encaje ").append(Math.round(i.score())).append("/100\n")
                    .append("  ").append(i.jobUrl()).append("\n  Fuente: ").append(i.sourceName()).append(" ").append(i.sourceUrl()).append("\n\n");
            html.append("<li><a href=\"").append(HtmlUtils.htmlEscape(i.jobUrl())).append("\">").append(HtmlUtils.htmlEscape(i.title())).append("</a> — ")
                    .append(HtmlUtils.htmlEscape(i.company())).append(" (").append(HtmlUtils.htmlEscape(i.where())).append(") · encaje ").append(Math.round(i.score()))
                    .append("/100 · fuente: <a href=\"").append(HtmlUtils.htmlEscape(i.sourceUrl())).append("\">").append(HtmlUtils.htmlEscape(i.sourceName())).append("</a></li>");
        }
        String footer = "Recibes este correo porque activaste las alertas en NORTE. Puedes desactivarlas o retirar tu consentimiento en " + props.siteUrl() + "/cuenta";
        text.append(footer);
        html.append("</ul><p style=\"color:#555\">").append(HtmlUtils.htmlEscape(footer)).append("</p>");
        try {
            MimeMessage message = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(props.alerts().from());
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(text.toString(), html.toString());
            sender.send(message);
        } catch (MessagingException e) {
            throw new IllegalStateException("No se pudo construir el correo de alertas", e);
        }
    }
}
