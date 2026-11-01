package io.github.diegofranciscog.norte.it;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Sirve un índice estático de prueba (como GitHub Pages) para que la API lo lea al calcular alertas. */
final class IndexStub {

    private final HttpServer server;
    private final Map<String, String> files = new ConcurrentHashMap<>();

    private IndexStub(HttpServer server) {
        this.server = server;
    }

    static IndexStub start() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            IndexStub stub = new IndexStub(server);
            server.createContext("/data/v1/", exchange -> {
                String name = exchange.getRequestURI().getPath().substring("/data/v1/".length());
                String body = stub.files.get(name);
                byte[] bytes = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(body == null ? 404 : 200, body == null ? -1 : bytes.length);
                if (body != null) {
                    try (OutputStream out = exchange.getResponseBody()) {
                        out.write(bytes);
                    }
                }
                exchange.close();
            });
            server.start();
            return stub;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/data/v1";
    }

    void put(String name, String json) {
        files.put(name, json);
    }
}
