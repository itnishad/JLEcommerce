import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { AuthService } from "../auth.service";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import {User} from '../../../../generated/prisma/client'

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly authService: AuthService){
        super({usernameField: 'email', passwordField: 'password'});
    }

    async validate(email: string, password: string): Promise<User> {
        const user = await this.authService.validUser(email, password)

        if(!user){
            throw new UnauthorizedException('Invalid Credential')
        }

        return user
    }

}