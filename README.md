# Archinsight

Archinsight project tends to implement architecture-as-code definition
of a standard c4 architecture model. This project offers a new `Insight`
language designed in such way that an Architect can focus on 
architecture definition, not visualization. Compared to UML,
the Insight language is more specific and is unable to describe an
arbitrary entity, but shorter and probably easier to use.

Unlike other UML software, such as PlantUML, Archinsight would offer it's user:
* A specific Insight language to describe c4 model
* Model integrity check by compiler
* Model interactivity
* Architecture introspections from highest to lowest level in one place

## Try it out
Preview language and features in [Playground](https://archinsight.org/playground/)

## Building a project
To build Archinsight from source, you need:
* JDK 20
* Docker

To run a build use command:
```shell
./gradlew clean dockerBuild
```
This will build Compiler, Renderer and Editor UI services into docker images and place 
them into your local docker repository

## Project documentation
[Insight Language](https://archinsight.org/doc/insight-language/)
[Installation Guide](https://archinsight.org/doc/installation-guide/)
[Developer Guide](https://archinsight.org/doc/developer-guide/)

## Builds
[Docker Hub](https://hub.docker.com/r/lonelylockley/archinsight)
## c4 model
https://c4model.com/

## License
Archinsight - c4 architecture as code.

Copyright (C) 2022  Alexey Zaytsev &lt;lonelylockley@gmail.com&gt;

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
