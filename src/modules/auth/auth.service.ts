import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserService } from '../users/user.service';
import * as argon2 from 'argon2'
import { JwtService } from '@nestjs/jwt';
import { User, Prisma } from '../../../generated/prisma/client'
import { AccessTokenPayload } from './types';

@Injectable()
export class AuthService {
    constructor(private readonly userService: UserService, private readonly jswService: JwtService) {}

    async validUser(email: string, password: string) {
        const user = await this.userService.findUserByEmail(email);

        if (!user) {
            return null
        }

        const isPasswordMatch = await argon2.verify(user.password, password);

        if (!isPasswordMatch) {
            return null
        }

        return user
    }

    generateToken(payload: AccessTokenPayload) {
        const accessToken = this.jswService.sign(payload);
        return accessToken;
    }

    async register(userInfo: Prisma.UserCreateInput) {
        const isUser = await this.userService.findUserByEmail(userInfo.email);

        if (isUser) {
            throw new BadRequestException('User Is Already Exists')
        }

        const hashPassword = await argon2.hash(userInfo.password);

        userInfo.password = hashPassword

        const newUserInfo = await this.userService.create(userInfo)

        const accessToken = this.generateToken({ id: newUserInfo.id, email: newUserInfo.email });

        return {
            success: true,
            data: {
                user: {
                    id: newUserInfo.id,
                    name: newUserInfo.name,
                    email: newUserInfo.email
                },
                token: accessToken
            }
        }
    }

    async login(user: User) {
        const accessToken = this.generateToken({ id: user.id, email: user.email });
        return {
            success: true,
            data: {
                token: accessToken
            }
        }
    }
}
