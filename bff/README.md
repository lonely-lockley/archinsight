## Archinsight Proxy
***

### Requirements
- NodeJS 16


### Run in dev mode
```bash
npm ci
npm run start
```


### Production build
```bash
npm ci
npm run build
npm run prod
```

### Docker env
- COMPILER http://localhost:3333
- RENDERER: http://localhost:3334
- PORT: 3000

## License
Archinsight Proxy - is a part of Archinsight software.

Copyright (C) 2022  Oleg Konev &lt;i.m.n-d@yandex.com&gt;

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
