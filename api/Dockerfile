# API de NORTE: compila con Maven y corre en un JRE mínimo, sin root.
FROM maven:3.9.16-eclipse-temurin-25-alpine AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
# Las pruebas corren en CI (necesitan Docker para PostgreSQL real y los datos del repositorio).
RUN mvn -B -q -DskipTests package && cp target/norte-api-*.jar /src/app.jar

FROM eclipse-temurin:27-jre-alpine-3.24
RUN addgroup -S norte && adduser -S -G norte -H norte
WORKDIR /app
COPY --from=build --chown=norte:norte /src/app.jar app.jar
USER norte
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${APP_PORT:-8080}/actuator/health" | grep -q '"UP"' || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/app.jar"]
