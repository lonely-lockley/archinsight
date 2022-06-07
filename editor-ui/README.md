## Archinsight UI
***

### Requirements
- NodeJS 16
- JDK 8


### Run in dev mode
```bash
npm ci
npm run antlr
npm run build:dev
```


### Production build
```bash
npm ci
npm run antlr
npm run build:prod

#if needs to check build
npm run serve
```

### Docker
- Bind port 8080
- Mount api.json to /app/api.json (optional)

## License
Archinsight UI - is a part of Archinsight software.

Copyright (C) 2022  Oleg Konev <Oleg Konev <i.m.n-d@yandex.com>>

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
