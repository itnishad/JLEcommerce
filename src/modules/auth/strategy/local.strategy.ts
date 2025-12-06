import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { AuthService } from "../auth.service";

export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly authService: AuthService){
        super({usernameField: 'email', passwordField: 'password'});
    }

    async validate(email: string, password: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

}