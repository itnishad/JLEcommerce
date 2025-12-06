import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod/v3';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}
  transform(value: any) {
    try {
      const parseValue = this.schema.parse(value);
      return parseValue;
    } catch (error) {
      console.log(error);
      throw new BadRequestException('Invalid body paramater');
    }
  }
}
