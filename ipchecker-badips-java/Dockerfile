FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build
COPY pom.xml .
COPY src ./src
RUN mvn -q package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /build/target/ipchecker-badips-java-1.0.0.jar /app/app.jar
EXPOSE 80
CMD ["java", "-jar", "/app/app.jar"]
