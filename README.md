# Archinsight

Archinsight implements an **architecture-as-code** approach, following the principles based on the [C4 model](https://c4model.com/). Its core feature is the **Insight** language, which simplifies architectural descriptions and frees architects from excessive visualization details. Insight emphasizes clarity, conciseness, and simplicity tailored to C4 diagrams.

---

## Try It Out

Explore the Insight language and Archinsight features in the [Playground](https://archinsight.org/app/playground/). Here, you can:
- Experiment with Insight’s syntax;
- See real-time visualizations;
- Discover the interactive diagram capabilities.

---

## Building the Project

To build Archinsight from source, you need:
- **JDK 20**
- **Docker**

Run the command:

```shell
./gradlew clean dockerBuild
```

This will:
- Compile all components;
- Package them into Docker images;
- Store those images in your local Docker repository.

---

## Documentation

Find more detailed information about Archinsight and its setup here:
- [Insight Language](https://archinsight.org/doc/insight-language/)  
  A comprehensive description of the Insight syntax with usage examples.
- [Installation Guide](https://archinsight.org/doc/installation-guide/)  
  Instructions on how to install and deploy Archinsight using Docker.
- [Developer Guide](https://archinsight.org/doc/developer-guide/)  
  Insights for contributors interested in helping develop and improve Archinsight.

---

## Builds

Official Docker images are available on [Docker Hub](https://hub.docker.com/r/lonelylockley/archinsight).

---

## License

**Archinsight – C4 architecture as code**  
Copyright 2021-2026 Alexey Zaytsev

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
