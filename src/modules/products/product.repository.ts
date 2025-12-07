import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { Prisma } from '../../../generated/prisma/client'

@Injectable()
export class ProductRepository {
    constructor(private readonly prisma: DatabaseService) { }

    async findById(id: string) {
        return this.prisma.product.findUnique({
            where: { id },
        });
    }
}