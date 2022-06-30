import { IsString } from 'class-validator';

export class CodeRequest {
  @IsString()
  source: string;
}
