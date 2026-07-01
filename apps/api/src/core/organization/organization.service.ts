import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string) {
    return this.prisma.organization.findUnique({
      where: { code },
    });
  }

  async findById(id: string) {
    return this.prisma.organization.findUnique({
      where: { id },
    });
  }

  async create(data: {
    name: string;
    code: string;
    email?: string;
    phone?: string;
    website?: string;
  }) {
    return this.prisma.organization.create({
      data,
    });
  }
}