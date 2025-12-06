import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import {User, Prisma} from '../../../generated/prisma/client'

@Injectable()
export class CartService {
    constructor(private prisma: DatabaseService){}

    async userab(): Promise<User[]>{
        return this.prisma.user.findMany({take: 10})
    }
}
