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
Copyright (C) 2022-2025
Alexey Zaytsev <lonelylockley@gmail.com>

This program is free software: you can redistribute it and/or modify  
it under the terms of the GNU Affero General Public License as  
published by the Free Software Foundation, either version 3 of the  
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,  
but **WITHOUT ANY WARRANTY**; without even the implied warranty of  
**MERCHANTABILITY** or **FITNESS FOR A PARTICULAR PURPOSE**. See the  
[GNU Affero General Public License](http://www.gnu.org/licenses/) for more details.

You should have received a copy of the GNU Affero General Public License  
along with this program. If not, see <http://www.gnu.org/licenses/>.
