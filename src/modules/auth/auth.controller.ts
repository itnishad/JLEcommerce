import { Body, Controller, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from '../../pipes/validation.pipe';
import { type registerDto, registerSchema } from './dto/register.dto';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { requestWithUser } from '../../decorators/user.decorator';
import {type User} from '../../../generated/prisma/client'

@Controller('auth')
export class AuthController {

    constructor(private readonly authService: AuthService){}
    
    @Post('register')
    @UsePipes(new ZodValidationPipe(registerSchema))
    async register(@Body() user: registerDto){
        return await this.authService.register(user)
    }

    @Post('login')
    @UseGuards(AuthGuard('local'))
    async login(
        @requestWithUser() user: User
    ){
        return this.authService.login(user);
    }
}
