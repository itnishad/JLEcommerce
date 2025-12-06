import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}
  transform(value: any) {
    try {
      const parseValue = this.schema.parse(value);
      return parseValue;
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));

        throw new BadRequestException({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }
      throw new BadRequestException('Invalid input');
    }
  }
}
