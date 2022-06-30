import { Body, Controller, Logger, Post } from '@nestjs/common';

import { CodeRequest } from '../common';
import { RenderService } from './render.service';

@Controller('v1')
export class RenderController {
  constructor(private readonly renderService: RenderService) {}

  @Post('render')
  async getImage(@Body() code: CodeRequest): Promise<string> {
    Logger.log(JSON.stringify(code), 'RenderEndpoint');

    const content = await this.renderService.getCompilerResult(code.source);
    Logger.log(JSON.stringify(content), 'Compiler');

    const result = await this.renderService.getRendererResult(content);
    Logger.log(JSON.stringify(result), 'Renderer');

    return result;
  }
}
