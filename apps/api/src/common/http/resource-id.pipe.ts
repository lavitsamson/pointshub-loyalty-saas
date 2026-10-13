import { NotFoundException, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

const UuidSchema = z.uuid();

/**
 * Route ids are UUIDs. A malformed id cannot match any row, so it gets the same 404 as an
 * id that does not exist (and never reaches Postgres, which would reject the cast).
 */
export class ResourceIdPipe implements PipeTransform<string, string> {
  constructor(private readonly resource: string) {}

  transform(value: string): string {
    if (!UuidSchema.safeParse(value).success) {
      throw new NotFoundException(`${this.resource} not found`);
    }
    return value;
  }
}
