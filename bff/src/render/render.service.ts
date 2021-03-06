import axios, { AxiosError } from 'axios';

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
        const parsedError = this.getError(err);
        throw new HttpException(parsedError, HttpStatus.BAD_REQUEST);
      });
  }

  async getRendererResult(content: string): Promise<string> {
    const url = `${this.worker.renderer}/render`;
    return axios
      .post<string>(url, { source: content })
      .then((res) => res.data)
      .catch((err) => {
        const parsedError = this.getError(err);
        throw new HttpException(parsedError, HttpStatus.BAD_REQUEST);
      });
  }

  getError(err: AxiosError<any>): string {
    const { response: res } = err;
    const message = res?.data?.message;
    const embedded: { message: string }[] = res?.data?._embedded?.errors;
    if (embedded?.length) {
      return embedded.reduce<string>(
        (acc, next) => acc.concat(next.message).concat('\n'),
        '',
      );
    } else if (message) {
      Logger.error(message, 'UI');
      return message;
    } else if (err?.message) {
      Logger.error(err.message, 'UI');
      return err.message;
    }
    return 'Unknown error';
  }
}
