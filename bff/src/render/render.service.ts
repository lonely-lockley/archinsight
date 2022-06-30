import axios from 'axios';

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { CodeRequest } from '../common';
import workersConfig from '../config/workers.config';

@Injectable()
export class RenderService {
  constructor(
    @Inject(workersConfig.KEY)
    private readonly worker: ConfigType<typeof workersConfig>,
  ) {}

  async getCompilerResult(code: string): Promise<string> {
    const lfCode = code.replace(/\r/g, '');
    const url = `${this.worker.compiler}/compile`;
    return axios
      .post<CodeRequest>(url, { source: lfCode })
      .then((res) => res.data.source)
      .catch((err) => {
        Logger.error(err, 'Compiler');
        throw new HttpException(err, HttpStatus.BAD_REQUEST);
      });
  }

  async getRendererResult(content: string): Promise<string> {
    const url = `${this.worker.renderer}/render`;
    return axios
      .post<string>(url, { source: content })
      .then((res) => res.data)
      .catch((err) => {
        Logger.error(err, 'Renderer');
        throw new HttpException(err, HttpStatus.BAD_REQUEST);
      });
  }
}
