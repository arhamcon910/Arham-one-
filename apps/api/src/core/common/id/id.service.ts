import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class IdService {
  generateId(): string {
    return randomUUID();
  }
}
