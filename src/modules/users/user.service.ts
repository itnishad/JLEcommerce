import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {User, Prisma} from '../../../generated/prisma/client'

@Injectable()
export class UserService {
    constructor(private prisma: DatabaseService){}

    async findUserByEmail(email: string): Promise<User | null> {
        return this.prisma.user.findFirst({
            where: {
                email
            }
        })
    }

    async create (user: Prisma.UserCreateInput): Promise<User> {
        return this.prisma.user.create({
            data: user
        })
    }
}
